"""
PitchVision — FastAPI backend
Exposes detection inference and training accuracy data as REST endpoints.
Serves the React build in production.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

app = FastAPI(title="PitchVision API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Model loader ─────────────────────────────────────────────────

_model = None


def _find_model() -> Optional[Path]:
    for p in [
        Path("models/football_best.pt"),
        Path("models/best.pt"),
        Path("football_best.pt"),
        Path("best.pt"),
    ]:
        if p.exists():
            return p
    return None


def get_model():
    global _model
    if _model is not None:
        return _model

    mp = _find_model()
    if mp is None:
        raise HTTPException(
            status_code=503,
            detail="Model file not found. Place football_best.pt in the models/ folder.",
        )

    try:
        from ultralytics import YOLO
        _model = YOLO(str(mp))
        return _model
    except AttributeError as e:
        if "bn" in str(e).lower():
            # Try with explicit task to bypass fuse step
            try:
                from ultralytics import YOLO
                _model = YOLO(str(mp), task="detect")
                return _model
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail=(
                f"Model loading error: {e}\n"
                "Fix: pip install 'ultralytics>=8.0.0,<=8.0.196'"
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model loading error: {e}")



def _img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _resize_if_large(img: Image.Image, max_side: int = 1280) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    ratio = max_side / max(w, h)
    return img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)


# ── API endpoints ─────────────────────────────────────────────────

@app.get("/api/health")
def health():
    mp = _find_model()
    return {"status": "ok", "model_found": mp is not None}


@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted.")

    raw = await file.read()
    try:
        original = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read image: {e}")

    model = get_model()
    img_arr = np.array(original)

    try:
        preds = model(img_arr, conf=0.10, iou=0.30, imgsz=1280, augment=True, verbose=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

    raw_names: dict[int, str] = model.names  # type: ignore[assignment]

    # Parse boxes
    detections: list[dict] = []
    if preds and len(preds) > 0:
        boxes = preds[0].boxes
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls.item())
                conf = round(float(box.conf.item()), 4)
                x1, y1, x2, y2 = [round(float(v)) for v in box.xyxy[0].tolist()]
                raw_name = raw_names.get(cls_id, f"class_{cls_id}")
                detections.append(
                    {
                        "class_name": raw_name,
                        "score": conf,
                        "bbox": [x1, y1, x2, y2],
                    }
                )

    # Aggregate per category
    classes: dict[str, dict] = {}
    for det in detections:
        cn = det["class_name"]
        if cn not in classes:
            classes[cn] = {"count": 0, "scores": []}
        classes[cn]["count"] += 1
        classes[cn]["scores"].append(det["score"])
    for cn in classes:
        sc = classes[cn]["scores"]
        classes[cn]["avg_score"] = round(sum(sc) / len(sc), 4) if sc else 0

    # Annotated image
    if preds and len(preds) > 0:
        ann_bgr = preds[0].plot()
        annotated = Image.fromarray(ann_bgr[..., ::-1])
    else:
        annotated = original.copy()

    original = _resize_if_large(original)
    annotated = _resize_if_large(annotated)

    return {
        "total": len(detections),
        "classes": classes,
        "detections": detections,
        "annotated": _img_to_b64(annotated),
        "original": _img_to_b64(original),
        "filename": file.filename or "image",
    }


@app.get("/api/accuracy")
def accuracy():
    df = None
    for p in [Path("assets/results.csv"), Path("results.csv")]:
        if p.exists():
            df = pd.read_csv(p)
            df.columns = [c.strip() for c in df.columns]
            break

    if df is None:
        raise HTTPException(status_code=404, detail="Training data not found.")

    col_map = {
        "metrics/mAP50(B)":     "map50",
        "metrics/mAP50-95(B)":  "map5095",
        "metrics/precision(B)": "precision",
        "metrics/recall(B)":    "recall",
        "train/box_loss":       "train_box",
        "train/cls_loss":       "train_cls",
        "val/box_loss":         "val_box",
        "val/cls_loss":         "val_cls",
    }

    history = []
    for _, row in df.iterrows():
        entry: dict = {"epoch": int(row.get("epoch", 0)) + 1}
        for col, key in col_map.items():
            if col in df.columns:
                v = row[col]
                entry[key] = round(float(v), 6) if not pd.isna(v) else 0.0
        history.append(entry)

    best = max(history, key=lambda r: r.get("map50", 0), default={})

    return {"best": best, "history": history}


# ── Serve React build in production ──────────────────────────────

_dist = Path("frontend/dist")

if _dist.exists():
    app.mount("/assets", StaticFiles(directory=str(_dist / "assets")), name="vite-assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(str(_dist / "index.html"))
else:
    @app.get("/")
    def root():
        return {
            "message": (
                "PitchVision API is running. "
                "Start the React UI: cd frontend && npm run dev"
            )
        }


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

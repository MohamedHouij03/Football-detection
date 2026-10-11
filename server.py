"""
PitchVision — FastAPI backend
Exposes detection inference and training accuracy data as REST endpoints.
Serves the React build in production.
"""

from __future__ import annotations

import asyncio
import base64
import io
import queue
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import cv2
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="PitchVision API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TactiQ: tactical quiz feature built on top of this app's detection pipeline. Lives in
# its own package and is only ever mounted here — nothing above/below this block is
# touched by it, and the existing detection endpoints are unaffected.
from tactiq.db import init_db
from tactiq.routes_match import router as _tactiq_match_router
from tactiq.routes_quiz import router as _tactiq_quiz_router

init_db()
app.include_router(_tactiq_match_router)
app.include_router(_tactiq_quiz_router)


# ── Model loader ─────────────────────────────────────────────────

_model = None
_infer_lock = threading.Lock()  # ultralytics predictor state isn't thread-safe


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


def _boxes_to_detections(preds, raw_names: dict[int, str]) -> list[dict]:
    detections: list[dict] = []
    if preds and len(preds) > 0:
        boxes = preds[0].boxes
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls.item())
                conf = round(float(box.conf.item()), 4)
                x1, y1, x2, y2 = [round(float(v)) for v in box.xyxy[0].tolist()]
                detections.append(
                    {
                        "class_name": raw_names.get(cls_id, f"class_{cls_id}"),
                        "score": conf,
                        "bbox": [x1, y1, x2, y2],
                    }
                )
    return detections


def _aggregate_classes(detections: list[dict]) -> dict[str, dict]:
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
        del classes[cn]["scores"]
    return classes


def _probe_video(path: Path) -> Optional[dict]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        cap.release()
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "width": width,
        "height": height,
        "duration": round(total_frames / fps, 1) if fps else None,
    }


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
        with _infer_lock:
            preds = model(img_arr, conf=0.60, iou=0.30, imgsz=1280, augment=True, verbose=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

    raw_names: dict[int, str] = model.names  # type: ignore[assignment]
    detections = _boxes_to_detections(preds, raw_names)
    classes = _aggregate_classes(detections)

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


# ── Video: fully pre-analyze, then play back with synced overlays ──

_VIDEO_EXTS = (".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v")
_VIDEO_JOBS_DIR = Path(tempfile.gettempdir()) / "pitchvision_video_jobs"
_VIDEO_LIBRARY_DIR = Path("videos")
_VIDEO_LIBRARY_DIR.mkdir(exist_ok=True)
_video_jobs: dict[str, dict] = {}  # job_id -> {"path": Path, "media_url": str}
_VIDEO_TARGET_FPS = 6  # how many frames/sec of source video we actually run inference on

# Video is now fully pre-analyzed before playback (see /ws/video), so there's no
# real-time budget to hit. Benchmarked on CPU: imgsz=640 (the old setting) found
# only ~1 box/frame on broadcast footage vs ~2.9 at 960 and ~5.6 at 1280 — this
# model just can't see small/distant players and the ball at 640px. augment=True
# barely helped (1.0 -> 1.25 boxes/frame at 640) for ~2.7x the cost, so it's not
# worth it. 960 is the practical sweet spot; bump to 1280 if you can afford the
# roughly 2x longer pre-analysis wait for a bit more recall.
_VIDEO_INFER_IMGSZ = 960
_VIDEO_INFER_AUGMENT = False

app.mount("/videos", StaticFiles(directory=str(_VIDEO_LIBRARY_DIR)), name="video-library")


@app.get("/api/video/library")
def video_library():
    items = []
    for p in sorted(_VIDEO_LIBRARY_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in _VIDEO_EXTS:
            meta = _probe_video(p)
            if meta:
                items.append({
                    "filename": p.name,
                    "size_mb": round(p.stat().st_size / (1024 * 1024), 1),
                    **meta,
                })
    return {"videos": items}


class LocalVideoRequest(BaseModel):
    filename: str


@app.post("/api/video/analyze-local")
async def analyze_local_video(body: LocalVideoRequest):
    safe_name = Path(body.filename).name  # strip any directory components
    path = _VIDEO_LIBRARY_DIR / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video not found in library.")

    meta = _probe_video(path)
    if meta is None:
        raise HTTPException(status_code=400, detail="Cannot read video file.")

    job_id = uuid.uuid4().hex
    media_url = f"/videos/{quote(safe_name)}"
    _video_jobs[job_id] = {"path": path, "media_url": media_url}
    return {"job_id": job_id, "media_url": media_url, **meta}


@app.post("/api/video/upload")
async def upload_video(file: UploadFile = File(...)):
    is_video_type = file.content_type and file.content_type.startswith("video/")
    is_video_ext = (file.filename or "").lower().endswith(_VIDEO_EXTS)
    if not (is_video_type or is_video_ext):
        raise HTTPException(status_code=400, detail="Only video files are accepted.")

    _VIDEO_JOBS_DIR.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4().hex
    dest = _VIDEO_JOBS_DIR / f"{job_id}_{Path(file.filename or 'video.mp4').name}"

    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    meta = _probe_video(dest)
    if meta is None:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Cannot read video file.")

    media_url = f"/api/video/media/{job_id}"
    _video_jobs[job_id] = {"path": dest, "media_url": media_url}
    return {"job_id": job_id, "media_url": media_url, **meta}


@app.get("/api/video/media/{job_id}")
def video_media(job_id: str):
    job = _video_jobs.get(job_id)
    if job is None or not job["path"].exists():
        raise HTTPException(status_code=404, detail="Unknown or expired job.")
    return FileResponse(str(job["path"]), media_type="video/mp4")


def _video_worker(
    path: Path,
    model,
    frame_queue: "queue.Queue[dict]",
    stop_event: threading.Event,
) -> None:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    stride = max(1, round(fps / _VIDEO_TARGET_FPS))
    raw_names: dict[int, str] = model.names  # type: ignore[assignment]

    idx = 0
    try:
        while not stop_event.is_set():
            ok, frame_bgr = cap.read()
            if not ok:
                break
            idx += 1
            if idx % stride != 0:
                continue

            try:
                with _infer_lock:
                    preds = model(
                        frame_bgr[..., ::-1],
                        conf=0.60, iou=0.30,
                        imgsz=_VIDEO_INFER_IMGSZ, augment=_VIDEO_INFER_AUGMENT,
                        verbose=False,
                    )
            except Exception as e:
                frame_queue.put({"type": "error", "detail": f"Detection failed: {e}"})
                return

            detections = _boxes_to_detections(preds, raw_names)
            classes = _aggregate_classes(detections)

            frame_queue.put({
                "type": "frame",
                "frame_idx": idx,
                "total_frames": total_frames,
                "timestamp": round(idx / fps, 2),
                "total": len(detections),
                "classes": classes,
                "detections": detections,
            })
    finally:
        cap.release()
        frame_queue.put({"type": "stopped" if stop_event.is_set() else "done", "total_frames": total_frames})


@app.websocket("/ws/video/{job_id}")
async def ws_video(websocket: WebSocket, job_id: str):
    await websocket.accept()

    job = _video_jobs.get(job_id)
    if job is None or not job["path"].exists():
        await websocket.send_json({"type": "error", "detail": "Unknown or expired job."})
        await websocket.close()
        return

    try:
        model = get_model()
    except HTTPException as e:
        await websocket.send_json({"type": "error", "detail": e.detail})
        await websocket.close()
        return

    frame_queue: "queue.Queue[dict]" = queue.Queue(maxsize=4)
    stop_event = threading.Event()
    worker = threading.Thread(
        target=_video_worker, args=(job["path"], model, frame_queue, stop_event), daemon=True,
    )
    worker.start()

    async def watch_for_stop():
        try:
            while True:
                msg = await websocket.receive_text()
                if msg == "stop":
                    stop_event.set()
                    break
        except WebSocketDisconnect:
            stop_event.set()

    stop_watcher = asyncio.create_task(watch_for_stop())
    loop = asyncio.get_event_loop()

    try:
        while True:
            msg = await loop.run_in_executor(None, frame_queue.get)
            await websocket.send_json(msg)
            if msg["type"] in ("done", "stopped", "error"):
                break
    except WebSocketDisconnect:
        stop_event.set()
    finally:
        stop_event.set()
        stop_watcher.cancel()
        worker.join(timeout=3)
        # Keep the job (and its file) registered — the <video> element may
        # still be playing/seeking well after analysis has finished.
        try:
            await websocket.close()
        except Exception:
            pass


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

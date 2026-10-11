"""Match Mode endpoints: tracked+team-classified video analysis (cached by content
hash) and pitch calibration. Reuses the existing /api/video/upload and
/api/video/analyze-local endpoints for sourcing a video — this module only adds the
tracking/team/calibration layer on top of an already-registered job.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading
from contextlib import closing

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from tactiq import cache, calibration, db
from tactiq.match_worker import run_match_analysis

router = APIRouter()

_IMGSZ = 960


@router.get("/api/match/ping")
def ping():
    return {"status": "ok"}


@router.websocket("/ws/match/{job_id}")
async def ws_match(websocket: WebSocket, job_id: str):
    await websocket.accept()

    # Lazy import: server.py imports this module's router at load time, so importing
    # server.py back at THIS module's top level would be circular. By the time a
    # request actually arrives, server.py is fully loaded — safe to import here.
    from server import _video_jobs, _find_model, get_model, _infer_lock

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

    model_path = _find_model()
    video_hash = cache.file_hash(job["path"])
    config_stamp = cache.current_config_stamp(model_path, _IMGSZ)
    cached = cache.load_cached_analysis(video_hash, config_stamp)

    if cached is not None:
        # Replay the cached result through the exact same message shapes a live run
        # would send, so the frontend doesn't need to branch on cache hit/miss.
        with closing(db.get_connection()) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO videos (video_hash, display_name, fps, total_frames) "
                "VALUES (?, ?, ?, ?)",
                (video_hash, job["path"].name, cached["fps"], cached["total_frames"]),
            )
            conn.commit()
        for frame in cached["frames"]:
            await websocket.send_json({
                "type": "frame",
                "frame_idx": frame["frame_idx"],
                "total_frames": cached["total_frames"],
                "timestamp": frame["timestamp"],
                "total": len(frame["detections"]),
                "detections": frame["detections"],
            })
        await websocket.send_json({"type": "teams", "team_map": cached["team_map"]})
        await websocket.send_json({
            "type": "done", "total_frames": cached["total_frames"], "video_hash": video_hash,
        })
        await websocket.close()
        return

    frame_queue: "queue.Queue[dict]" = queue.Queue(maxsize=4)
    stop_event = threading.Event()
    worker = threading.Thread(
        target=run_match_analysis,
        args=(job["path"], model, _infer_lock, frame_queue, stop_event, video_hash, config_stamp),
        kwargs={"imgsz": _IMGSZ},
        daemon=True,
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
            if msg["type"] == "done":
                msg["video_hash"] = video_hash
                with closing(db.get_connection()) as conn:
                    conn.execute(
                        "INSERT OR IGNORE INTO videos (video_hash, display_name, fps, total_frames) "
                        "VALUES (?, ?, ?, ?)",
                        (video_hash, job["path"].name, None, msg.get("total_frames")),
                    )
                    conn.commit()
            await websocket.send_json(msg)
            if msg["type"] in ("done", "stopped", "error"):
                break
    except WebSocketDisconnect:
        stop_event.set()
    finally:
        stop_event.set()
        stop_watcher.cancel()
        worker.join(timeout=3)
        try:
            await websocket.close()
        except Exception:
            pass


@router.get("/api/match/result/{video_hash}")
def get_match_result(video_hash: str):
    """Fetch an already-cached analysis directly — used by Coach/Quiz pages that just
    need the data, not the live progress stream."""
    # Any cached result is valid to read regardless of the *current* config stamp —
    # staleness only matters for deciding whether to re-run analysis, not for reading
    # what's already there.
    path = cache.cache_file_path(video_hash)
    if not path.exists():
        raise HTTPException(status_code=404, detail="No analysis cached for this video yet.")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/api/match/calibration/{video_hash}")
def get_calibration(video_hash: str):
    with closing(db.get_connection()) as conn:
        row = conn.execute(
            "SELECT * FROM pitch_calibrations WHERE video_hash = ?", (video_hash,)
        ).fetchone()
    if row is None:
        return {"calibrated": False, "landmarks": calibration.STANDARD_LANDMARKS}
    return {
        "calibrated": True,
        "pixel_points": json.loads(row["pixel_points"]),
        "pitch_points": json.loads(row["pitch_points"]),
    }


@router.post("/api/match/calibration/{video_hash}")
def save_calibration(video_hash: str, body: dict):
    """body: {"points": [{"pixel_xy": [x,y], "landmark_id": "corner_tl"}, ...]} — at
    least 4 entries, landmark_id must match tactiq.calibration.STANDARD_LANDMARKS."""

    points = body.get("points", [])
    if len(points) < 4:
        raise HTTPException(status_code=400, detail="Need at least 4 calibration points.")

    landmark_by_id = {lm["id"]: lm["xy_m"] for lm in calibration.STANDARD_LANDMARKS}
    pixel_pts, pitch_pts = [], []
    for p in points:
        landmark_xy = landmark_by_id.get(p.get("landmark_id"))
        if landmark_xy is None:
            raise HTTPException(status_code=400, detail=f"Unknown landmark_id: {p.get('landmark_id')}")
        pixel_pts.append(p["pixel_xy"])
        pitch_pts.append(list(landmark_xy))

    try:
        homography = calibration.compute_homography(pixel_pts, pitch_pts)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    with closing(db.get_connection()) as conn:
        conn.execute(
            "INSERT INTO pitch_calibrations (video_hash, pixel_points, pitch_points, homography) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(video_hash) DO UPDATE SET pixel_points=excluded.pixel_points, "
            "pitch_points=excluded.pitch_points, homography=excluded.homography, "
            "updated_at=datetime('now')",
            (video_hash, json.dumps(pixel_pts), json.dumps(pitch_pts), json.dumps(homography)),
        )
        conn.commit()

    return {"status": "ok", "homography": homography}

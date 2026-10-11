"""Background worker that runs the full Match Mode analysis pass on a clip: dense
tracking + per-frame jersey-color sampling, then team clustering once the clip is
fully seen, then a cache write. Mirrors server._video_worker's thread/queue/stop_event
shape (same proven pattern), with a richer per-frame payload.
"""

from __future__ import annotations

import queue
import threading
from collections import defaultdict
from pathlib import Path

import cv2

from tactiq import cache, teams, tracking

MIN_TRACK_FRAMES_FOR_TEAM = 3  # ignore 1-2 frame ghost tracks when clustering teams


def run_match_analysis(
    path: Path,
    model,
    infer_lock,
    frame_queue: "queue.Queue[dict]",
    stop_event: threading.Event,
    video_hash: str,
    config_stamp: dict,
    imgsz: int = 960,
) -> None:
    """Runs as a background thread (see server._video_worker for the same pattern) —
    a Thread's return value is discarded, so the cache write happens here directly
    rather than trying to hand data back through the thread's return."""
    from server import _aggregate_classes  # lazy: avoids a circular import at module load

    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    stride = tracking.stride_for(fps)

    with infer_lock:
        tracking.reset_tracker_state(model)

    all_frames: list[dict] = []
    track_frame_counts: dict[int, int] = defaultdict(int)
    jersey_samples: dict[int, list] = defaultdict(list)

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
                preds = tracking.track_frame(
                    model, infer_lock, frame_bgr[..., ::-1], imgsz=imgsz,
                )
            except Exception as e:
                frame_queue.put({"type": "error", "detail": f"Tracking failed: {e}"})
                return

            detections = tracking.boxes_to_tracked_detections(preds, model.names)
            player_boxes = [d["bbox"] for d in detections if d["class_name"] not in teams.EXCLUDED_CLASSES]

            for d in detections:
                tid = d["track_id"]
                if tid is None:
                    continue
                track_frame_counts[tid] += 1
                if d["class_name"] not in teams.EXCLUDED_CLASSES:
                    others = [b for b in player_boxes if b is not d["bbox"]]
                    if teams.is_isolated(d["bbox"], others):
                        crop = teams.jersey_crop(frame_bgr, d["bbox"])
                        color = teams.dominant_color(crop)
                        if color is not None:
                            jersey_samples[tid].append(color)

            frame_record = {
                "frame_idx": idx,
                "timestamp": round(idx / fps, 2),
                "detections": detections,
            }
            all_frames.append(frame_record)

            frame_queue.put({
                "type": "frame",
                "frame_idx": idx,
                "total_frames": total_frames,
                "timestamp": frame_record["timestamp"],
                "total": len(detections),
                "detections": detections,
                "classes": _aggregate_classes(detections),
            })
    finally:
        cap.release()

    if stop_event.is_set():
        frame_queue.put({"type": "stopped", "total_frames": total_frames})
        return

    track_colors = {
        tid: teams.aggregate_track_color(samples)
        for tid, samples in jersey_samples.items()
        if track_frame_counts[tid] >= MIN_TRACK_FRAMES_FOR_TEAM
    }
    team_map = {str(tid): team for tid, team in teams.cluster_teams(track_colors).items()}

    frame_queue.put({"type": "teams", "team_map": team_map})

    cache.save_cached_analysis(video_hash, {
        "config_stamp": config_stamp,
        "fps": fps,
        "total_frames": total_frames,
        "stride": stride,
        "frames": all_frames,
        "team_map": team_map,
        "track_frame_counts": {str(tid): n for tid, n in track_frame_counts.items()},
    })

    frame_queue.put({"type": "done", "total_frames": total_frames})

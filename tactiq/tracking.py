"""Player/ball tracking for TactiQ match analysis.

This is a dedicated, denser-sampling tracking pass — deliberately separate from the
existing fast `/ws/video` pipeline in server.py, which intentionally avoids tracking.
That's not an oversight: `model.track(persist=True, tracker="bytetrack.yaml")` was
already tried once on the 6fps-sampled Live pipeline and measured to drop ~23% of real
detections, because ByteTrack's IoU-based frame-to-frame matching breaks down when
consecutive *sampled* frames are far apart in time (players/ball move too far between
samples at 6fps for IoU to associate them, so unmatched low-confidence detections get
silently dropped instead of becoming new tracks). The fix is not a different tracker —
it's sampling dense enough that consecutive tracked frames are close in time.
"""

from __future__ import annotations

TRACK_TARGET_FPS = 12  # denser than Live's 6fps; validated empirically in scripts/debug_tracking.py


def reset_tracker_state(model) -> None:
    """Force Ultralytics to rebuild its predictor+tracker from scratch on the next
    `.track()` call. Must run before the first frame of every new clip — `model` is a
    shared global instance (see server.get_model()), so without this, track IDs and
    motion state would leak across unrelated clips analyzed in the same server lifetime.
    """
    model.predictor = None


def stride_for(fps: float, target_fps: float = TRACK_TARGET_FPS) -> int:
    return max(1, round(fps / target_fps))


def track_frame(model, infer_lock, frame_rgb, imgsz: int = 960, conf: float = 0.5, iou: float = 0.3):
    """Run one tracked inference call under the shared inference lock.

    conf defaults lower than the 0.60 used for plain detection (server.py) because
    ByteTrack's own two-stage matching already filters low-confidence noise via its
    track association logic — clamping conf too high here starves it of the
    low-confidence-but-real detections it needs to maintain existing tracks.
    """
    with infer_lock:
        return model.track(
            frame_rgb,
            persist=True,
            tracker="bytetrack.yaml",
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            verbose=False,
        )


def boxes_to_tracked_detections(preds, raw_names: dict[int, str]) -> list[dict]:
    """Like server._boxes_to_detections, but also carries track_id when ByteTrack
    confirmed one for that box (None if untracked this frame — a real possibility,
    e.g. a brand new track that hasn't matched/activated yet)."""
    detections: list[dict] = []
    if preds and len(preds) > 0:
        boxes = preds[0].boxes
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls.item())
                conf = round(float(box.conf.item()), 4)
                x1, y1, x2, y2 = [round(float(v)) for v in box.xyxy[0].tolist()]
                det = {
                    "class_name": raw_names.get(cls_id, f"class_{cls_id}"),
                    "score": conf,
                    "bbox": [x1, y1, x2, y2],
                    "track_id": int(box.id.item()) if box.id is not None else None,
                }
                detections.append(det)
    return detections

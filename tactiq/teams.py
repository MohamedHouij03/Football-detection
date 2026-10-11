"""Two-team jersey-color classification.

Two-pass by design: pass 1 (tracking.py, driven by match_worker.py) collects a jersey
color sample for every player/goalkeeper detection as the clip is tracked; pass 2 (this
module) clusters those samples into two teams only after the whole clip has been seen,
then assigns each track_id by a robust aggregate (median) across its own samples. This
is what keeps a team label stable for one player across the whole clip instead of
flickering frame to frame — it would be impossible to get a stable 2-way split from a
single frame or a running/incremental clustering.
"""

from __future__ import annotations

import cv2
import numpy as np

EXCLUDED_CLASSES = {"referee", "ball"}  # already distinct detector classes; not clustered

# Pitch green in OpenCV HSV (H channel is 0-179, not 0-359). Masked out before sampling
# jersey color so grass visible between/around a player's legs doesn't bias the estimate.
_GREEN_HUE_LOW, _GREEN_HUE_HIGH = 35, 85


_CROWD_IOU_THRESHOLD = 0.05  # skip color sampling if another box overlaps this much


def box_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def is_isolated(bbox: list[float], other_bboxes: list[list[float]]) -> bool:
    """True if `bbox` doesn't meaningfully overlap any box in `other_bboxes`. Jersey
    color sampling skips crowded detections entirely rather than risk a torso crop
    that's actually sampling a nearby player, the gap between two players, or an
    occluding limb — a color sample from a clean, isolated view is worth far more
    than a contaminated one from every frame. Threshold is deliberately low (any
    real overlap counts) since even a small intrusion at the crop's edge can shift
    the median color enough to misclassify a close call."""
    return all(box_iou(bbox, other) < _CROWD_IOU_THRESHOLD for other in other_bboxes)


def jersey_crop(frame_bgr: np.ndarray, bbox: list[float]) -> np.ndarray:
    """Torso band of a detection box: skips the head (top ~15%) and everything from
    the waist down (bottom ~45%) vertically, and the outer ~20% on each side
    horizontally — a tight box around a player standing close to another is often
    loose enough that its left/right edges are already over the neighbor, not this
    player, so narrowing in from the sides is a cheap way to avoid sampling them."""
    x1, y1, x2, y2 = [int(v) for v in bbox]
    h = y2 - y1
    w = x2 - x1
    ty1 = max(y1 + int(0.15 * h), 0)
    ty2 = max(y1 + int(0.55 * h), ty1 + 1)
    tx1 = max(x1 + int(0.20 * w), 0)
    tx2 = max(x2 - int(0.20 * w), tx1 + 1)
    return frame_bgr[ty1:ty2, tx1:tx2]


def dominant_color(patch_bgr: np.ndarray) -> tuple[float, float, float] | None:
    """Dominant BGR color of a jersey crop, with pitch-green pixels masked out first."""
    if patch_bgr.size == 0:
        return None
    hsv = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2HSV)
    hue = hsv[..., 0]
    not_green = (hue < _GREEN_HUE_LOW) | (hue > _GREEN_HUE_HIGH)
    pixels = patch_bgr[not_green]
    if pixels.shape[0] < 10:  # crop was almost entirely grass / too small to trust
        pixels = patch_bgr.reshape(-1, 3)
    if pixels.shape[0] < 1:
        return None
    pixels = pixels.astype(np.float32)
    k = 1 if pixels.shape[0] < 5 else min(2, pixels.shape[0])
    _, _, centers = cv2.kmeans(
        pixels, k, None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0),
        3, cv2.KMEANS_PP_CENTERS,
    )
    return tuple(float(c) for c in centers[0])


def aggregate_track_color(samples: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    """Per-channel median across all of one track's per-frame color samples — robust
    to a handful of noisy/occluded/backlit frames pulling the estimate off."""
    arr = np.array(samples, dtype=np.float32)
    return tuple(float(v) for v in np.median(arr, axis=0))


def cluster_teams(track_colors: dict[int, tuple[float, float, float]]) -> dict[int, int]:
    """track_colors: {track_id: representative BGR}. Returns {track_id: 0 | 1}."""
    track_ids = list(track_colors.keys())
    if len(track_ids) < 2:
        return {tid: 0 for tid in track_ids}
    samples = np.array([track_colors[tid] for tid in track_ids], dtype=np.float32)
    _, labels, _ = cv2.kmeans(
        samples, 2, None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0),
        5, cv2.KMEANS_PP_CENTERS,
    )
    return {tid: int(label) for tid, label in zip(track_ids, labels.flatten())}

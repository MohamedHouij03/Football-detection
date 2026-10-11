"""Manual pitch calibration: 4+ clicked image points mapped to known real-world pitch
landmarks (standard pitch: 105m x 68m), solved via homography. Deliberately manual —
automatic pitch-line detection is its own hard CV problem (effectively a second model),
out of scope here. If a clip has no calibration, pitch coordinates are simply absent
from API responses — never derive meters from raw pixels without a real homography.
"""

from __future__ import annotations

import numpy as np
import cv2

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0

# Landmarks a Coach can pick from a dropdown instead of typing meter values by hand —
# removes an easy source of calibration error.
STANDARD_LANDMARKS = [
    {"id": "corner_tl", "label": "Top-left corner", "xy_m": (0.0, 0.0)},
    {"id": "corner_tr", "label": "Top-right corner", "xy_m": (PITCH_LENGTH_M, 0.0)},
    {"id": "corner_bl", "label": "Bottom-left corner", "xy_m": (0.0, PITCH_WIDTH_M)},
    {"id": "corner_br", "label": "Bottom-right corner", "xy_m": (PITCH_LENGTH_M, PITCH_WIDTH_M)},
    {"id": "center", "label": "Center spot", "xy_m": (PITCH_LENGTH_M / 2, PITCH_WIDTH_M / 2)},
    {"id": "pen_spot_l", "label": "Left penalty spot", "xy_m": (11.0, PITCH_WIDTH_M / 2)},
    {"id": "pen_spot_r", "label": "Right penalty spot", "xy_m": (PITCH_LENGTH_M - 11.0, PITCH_WIDTH_M / 2)},
]


def compute_homography(pixel_pts: list[list[float]], pitch_pts: list[list[float]]) -> list[float]:
    """Solves for the homography mapping image pixels -> pitch meters.
    Needs at least 4 non-collinear point pairs. Returns the flattened 3x3 matrix (row-major,
    9 floats) for JSON storage."""
    if len(pixel_pts) < 4 or len(pixel_pts) != len(pitch_pts):
        raise ValueError("Need at least 4 matching pixel/pitch point pairs")
    src = np.array(pixel_pts, dtype=np.float32)
    dst = np.array(pitch_pts, dtype=np.float32)
    H, _ = cv2.findHomography(src, dst)
    if H is None:
        raise ValueError("Could not solve homography from the given points — are they collinear?")
    return [float(v) for v in H.flatten()]


def foot_point(bbox: list[float]) -> tuple[float, float]:
    """Bottom-center of a detection box — approximately where the feet meet the pitch
    plane, the right reference point for a homography computed from ground-plane
    landmarks (not the box center, which drifts upward as player height varies)."""
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, y2)


def pixel_to_pitch(homography_flat: list[float], x: float, y: float) -> tuple[float, float]:
    H = np.array(homography_flat, dtype=np.float64).reshape(3, 3)
    pt = np.array([[[x, y]]], dtype=np.float64)
    transformed = cv2.perspectiveTransform(pt, H)
    px, py = transformed[0, 0]
    return float(px), float(py)

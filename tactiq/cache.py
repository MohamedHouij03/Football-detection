"""Content-hash based cache for per-clip analysis results (tracked detections + team
assignments). Keyed by file content hash rather than the ephemeral job_id the existing
/api/video/* endpoints hand out, so re-uploading or re-picking the same clip tomorrow
still hits the cache instead of re-running YOLO.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional

from tactiq.tracking import TRACK_TARGET_FPS

CACHE_DIR = Path("cache/analysis")


def file_hash(path: Path) -> str:
    """sha1 of the full file — clips targeted by this feature are short, so this is cheap."""
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cache_file_path(video_hash: str) -> Path:
    return CACHE_DIR / f"{video_hash}.json"


def current_config_stamp(model_path: Path, imgsz: int) -> dict:
    """Captures everything that would make a cached result stale if changed: which
    model weights were used, the tracking sampling rate, and inference resolution."""
    return {
        "model_file": model_path.name,
        "model_mtime": model_path.stat().st_mtime,
        "track_target_fps": TRACK_TARGET_FPS,
        "imgsz": imgsz,
    }


def load_cached_analysis(video_hash: str, expected_stamp: dict) -> Optional[dict]:
    path = cache_file_path(video_hash)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if data.get("config_stamp") != expected_stamp:
        return None  # stale — model/tuning changed since this was cached
    return data


def save_cached_analysis(video_hash: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file_path(video_hash).write_text(json.dumps(data), encoding="utf-8")

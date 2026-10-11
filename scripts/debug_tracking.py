"""Slice-1 validation script for TactiQ tracking + team classification.

Not wired into the app — a standalone check that denser sampling actually fixes the
detection-drop problem that plain ByteTrack-at-6fps had (see tactiq/tracking.py).

Run from the project root:
    .venv/Scripts/python.exe scripts/debug_tracking.py
"""

from __future__ import annotations

import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2

from server import get_model, _infer_lock
from tactiq import teams, tracking

VIDEO_PATH = Path("videos/Highlights _ Spain 1-0 Argentina _ FIFA World Cup 2026™ FINAL.mp4")
CLIP_SECONDS = 10  # short slice — this is a validation run, not a full analysis


def run_plain_baseline(model, frames_rgb) -> int:
    """Plain (untracked) detection count on the exact same frames, same settings
    minus tracking — the number tracking must not regress far below."""
    total = 0
    for frame in frames_rgb:
        with _infer_lock:
            preds = model(frame, conf=0.5, iou=0.3, imgsz=960, verbose=False)
        boxes = preds[0].boxes
        total += len(boxes) if boxes is not None else 0
    return total


def run_tracked(model, frames_rgb):
    tracking.reset_tracker_state(model)
    all_detections = []
    track_frame_counts = defaultdict(int)
    jersey_samples = defaultdict(list)

    for frame_rgb in frames_rgb:
        preds = tracking.track_frame(model, _infer_lock, frame_rgb, imgsz=960, conf=0.5, iou=0.3)
        dets = tracking.boxes_to_tracked_detections(preds, model.names)
        all_detections.append(dets)

        frame_bgr = frame_rgb[..., ::-1]
        for d in dets:
            if d["track_id"] is None:
                continue
            track_frame_counts[d["track_id"]] += 1
            if d["class_name"] not in teams.EXCLUDED_CLASSES:
                crop = teams.jersey_crop(frame_bgr, d["bbox"])
                color = teams.dominant_color(crop)
                if color is not None:
                    jersey_samples[d["track_id"]].append(color)

    return all_detections, track_frame_counts, jersey_samples


def main():
    print(f"Loading {VIDEO_PATH} ...")
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    stride = tracking.stride_for(fps)
    n_frames_needed = int(CLIP_SECONDS * fps / stride)
    print(f"source fps={fps:.1f}, stride={stride} (~{fps/stride:.1f} sampled fps), "
          f"collecting {n_frames_needed} sampled frames (~{CLIP_SECONDS}s of clip)")

    frames_rgb = []
    idx = 0
    while len(frames_rgb) < n_frames_needed:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        idx += 1
        if idx % stride != 0:
            continue
        frames_rgb.append(frame_bgr[..., ::-1].copy())
    cap.release()
    print(f"collected {len(frames_rgb)} frames")

    model = get_model()

    print("\n--- plain (untracked) baseline ---")
    t0 = time.time()
    plain_total = run_plain_baseline(model, frames_rgb)
    print(f"plain total detections: {plain_total}  ({time.time()-t0:.1f}s)")

    print("\n--- tracked ---")
    t0 = time.time()
    all_detections, track_frame_counts, jersey_samples = run_tracked(model, frames_rgb)
    tracked_total = sum(len(d) for d in all_detections)
    dt = time.time() - t0
    print(f"tracked total detections: {tracked_total}  ({dt:.1f}s, {dt/len(frames_rgb):.2f}s/frame)")

    drop_pct = 100 * (1 - tracked_total / plain_total) if plain_total else 0
    print(f"\ndetection count change vs plain: {drop_pct:+.1f}% "
          f"(negative = tracking is DROPPING detections, the failure mode we're checking for)")

    n_confirmed_tracks = len(track_frame_counts)
    lifespans = sorted(track_frame_counts.values(), reverse=True)
    print(f"\n{n_confirmed_tracks} distinct track IDs confirmed across {len(frames_rgb)} frames")
    print(f"track lifespans (frames present), top 10: {lifespans[:10]}")
    print(f"track lifespans, bottom 10: {lifespans[-10:]}")

    print(f"\n{len(jersey_samples)} tracks have jersey color samples (player/goalkeeper only)")
    track_colors = {
        tid: teams.aggregate_track_color(samples)
        for tid, samples in jersey_samples.items()
        if len(samples) >= 2  # need at least a couple samples to trust the aggregate
    }
    team_map = teams.cluster_teams(track_colors)
    team_counts = defaultdict(int)
    for team in team_map.values():
        team_counts[team] += 1
    print(f"team split: {dict(team_counts)}")
    print("\nper-track: id, team, frames_tracked, median_BGR_color")
    for tid in sorted(track_colors, key=lambda t: -track_frame_counts[t])[:15]:
        print(f"  id={tid:<4} team={team_map.get(tid)}  frames={track_frame_counts[tid]:<4} "
              f"color_bgr={tuple(round(c) for c in track_colors[tid])}")


if __name__ == "__main__":
    main()

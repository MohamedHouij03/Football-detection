"""Coach Mode (author questions) + Quiz Player (play, auto-pause, choose, resume)
endpoints. Deliberately independent of Match Mode's tracking pipeline — this is a
plain video + manually-authored timestamp/choices tool, so it works on any uploaded
clip without waiting for tracking to run. Reuses the existing /api/video/upload and
/api/video/analyze-local endpoints for sourcing a video, same as routes_match.py.
"""

from __future__ import annotations

import json
from contextlib import closing

from fastapi import APIRouter, HTTPException

from tactiq import cache, db

router = APIRouter()


def _video_row_to_dict(row, question_count: int = 0) -> dict:
    return {
        "video_hash": row["video_hash"],
        "display_name": row["display_name"],
        "fps": row["fps"],
        "width": row["width"],
        "height": row["height"],
        "duration": row["duration"],
        "total_frames": row["total_frames"],
        "question_count": question_count,
    }


@router.post("/api/quiz/videos/register")
def register_video(body: dict):
    """body: the same {job_id, media_url, fps, total_frames, width, height, duration}
    shape /api/video/upload or /api/video/analyze-local already returns — this just
    additionally hashes the file content and upserts a stable video_hash record so
    Coach/Quiz don't depend on the ephemeral job_id."""
    from server import _video_jobs  # lazy: see routes_match.py for why

    job_id = body.get("job_id")
    job = _video_jobs.get(job_id)
    if job is None or not job["path"].exists():
        raise HTTPException(status_code=404, detail="Unknown or expired job.")

    video_hash = cache.file_hash(job["path"])
    with closing(db.get_connection()) as conn:
        conn.execute(
            "INSERT INTO videos (video_hash, display_name, fps, width, height, duration, total_frames) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(video_hash) DO UPDATE SET "
            "display_name=excluded.display_name, fps=excluded.fps, width=excluded.width, "
            "height=excluded.height, duration=excluded.duration, total_frames=excluded.total_frames",
            (video_hash, job["path"].name, body.get("fps"), body.get("width"),
             body.get("height"), body.get("duration"), body.get("total_frames")),
        )
        conn.commit()

    return {
        "video_hash": video_hash,
        "media_url": body.get("media_url"),
        "fps": body.get("fps"),
        "width": body.get("width"),
        "height": body.get("height"),
        "duration": body.get("duration"),
    }


@router.get("/api/quiz/videos")
def list_videos():
    with closing(db.get_connection()) as conn:
        rows = conn.execute("SELECT * FROM videos ORDER BY created_at DESC").fetchall()
        counts = dict(conn.execute(
            "SELECT video_hash, COUNT(*) FROM questions GROUP BY video_hash"
        ).fetchall())
    return {"videos": [_video_row_to_dict(r, counts.get(r["video_hash"], 0)) for r in rows]}


@router.get("/api/quiz/videos/{video_hash}/media_url")
def video_media_url(video_hash: str):
    """Coach/Quiz need a playable media_url for a video_hash they loaded from the
    registry (not freshly from an upload response) — resolve it by re-registering
    against the known local videos/ library if the filename matches, else 404.
    For uploaded (non-library) clips there's no stable re-fetch path once the job's
    temp file is gone — this app targets short library/demo clips for authoring."""
    from pathlib import Path
    with closing(db.get_connection()) as conn:
        row = conn.execute(
            "SELECT display_name FROM videos WHERE video_hash = ?", (video_hash,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown video_hash.")
    from urllib.parse import quote
    local_path = Path("videos") / row["display_name"]
    if local_path.exists():
        return {"media_url": f"/videos/{quote(row['display_name'])}"}
    raise HTTPException(
        status_code=404,
        detail="This clip was uploaded (not from the local library) and its temp file "
               "may have expired — re-upload it to continue authoring/playing.",
    )


@router.get("/api/quiz/questions")
def list_questions(video_hash: str):
    with closing(db.get_connection()) as conn:
        q_rows = conn.execute(
            "SELECT * FROM questions WHERE video_hash = ? ORDER BY timestamp ASC", (video_hash,)
        ).fetchall()
        questions = []
        for q in q_rows:
            c_rows = conn.execute(
                "SELECT * FROM choices WHERE question_id = ? ORDER BY order_index ASC", (q["id"],)
            ).fetchall()
            questions.append({
                "id": q["id"],
                "video_hash": q["video_hash"],
                "timestamp": q["timestamp"],
                "prompt": q["prompt"],
                "explanation": q["explanation"],
                "choices": [
                    {
                        "id": c["id"],
                        "label": c["label"],
                        "from_track_id": c["from_track_id"],
                        "to_track_id": c["to_track_id"],
                    }
                    for c in c_rows
                ],
            })
    return {"questions": questions}


def _normalize_choices(raw_choices) -> list[dict]:
    """Accepts either plain strings (simple text choices) or dicts
    {label, from_track_id?, to_track_id?, is_correct?} (pass-line choices). Returns a
    normalized list of dicts. 2-6 choices supported — not hardcoded to exactly 3,
    since a pass-decision question naturally wants one option per realistic target."""
    normalized = []
    for c in raw_choices or []:
        if isinstance(c, str):
            label = c.strip()
            if label:
                normalized.append({"label": label, "from_track_id": None, "to_track_id": None, "is_correct": False})
        elif isinstance(c, dict):
            label = (c.get("label") or "").strip()
            if label:
                normalized.append({
                    "label": label,
                    "from_track_id": c.get("from_track_id"),
                    "to_track_id": c.get("to_track_id"),
                    "is_correct": bool(c.get("is_correct")),
                })
    if not (2 <= len(normalized) <= 6):
        raise HTTPException(status_code=400, detail="Need between 2 and 6 non-empty choices.")
    return normalized


@router.post("/api/quiz/questions")
def create_question(body: dict):
    """body: {video_hash, timestamp, prompt, explanation?, choices: [...]}
    choices: list of strings, or list of {label, from_track_id?, to_track_id?, is_correct?}."""
    video_hash = body.get("video_hash")
    timestamp = body.get("timestamp")
    prompt = (body.get("prompt") or "").strip()

    if not video_hash or timestamp is None:
        raise HTTPException(status_code=400, detail="video_hash and timestamp are required.")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required.")
    choices = _normalize_choices(body.get("choices"))

    with closing(db.get_connection()) as conn:
        cur = conn.execute(
            "INSERT INTO questions (video_hash, timestamp, prompt, explanation) VALUES (?, ?, ?, ?)",
            (video_hash, timestamp, prompt, body.get("explanation") or ""),
        )
        question_id = cur.lastrowid
        for i, c in enumerate(choices):
            conn.execute(
                "INSERT INTO choices (question_id, label, order_index, is_correct, from_track_id, to_track_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (question_id, c["label"], i, int(c["is_correct"]), c["from_track_id"], c["to_track_id"]),
            )
        conn.commit()

    return {"id": question_id}


@router.put("/api/quiz/questions/{question_id}")
def update_question(question_id: int, body: dict):
    prompt = (body.get("prompt") or "").strip()
    timestamp = body.get("timestamp")
    if not prompt or timestamp is None:
        raise HTTPException(status_code=400, detail="prompt and timestamp are required.")
    choices = _normalize_choices(body.get("choices"))

    with closing(db.get_connection()) as conn:
        row = conn.execute("SELECT id FROM questions WHERE id = ?", (question_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Question not found.")
        conn.execute(
            "UPDATE questions SET prompt=?, timestamp=?, explanation=?, updated_at=datetime('now') WHERE id=?",
            (prompt, timestamp, body.get("explanation") or "", question_id),
        )
        conn.execute("DELETE FROM choices WHERE question_id = ?", (question_id,))
        for i, c in enumerate(choices):
            conn.execute(
                "INSERT INTO choices (question_id, label, order_index, is_correct, from_track_id, to_track_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (question_id, c["label"], i, int(c["is_correct"]), c["from_track_id"], c["to_track_id"]),
            )
        conn.commit()
    return {"status": "ok"}


@router.delete("/api/quiz/questions/{question_id}")
def delete_question(question_id: int):
    with closing(db.get_connection()) as conn:
        conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))
        conn.commit()
    return {"status": "ok"}


@router.post("/api/quiz/sessions")
def start_session(body: dict):
    video_hash = body.get("video_hash")
    if not video_hash:
        raise HTTPException(status_code=400, detail="video_hash is required.")
    with closing(db.get_connection()) as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM questions WHERE video_hash = ?", (video_hash,)
        ).fetchone()[0]
        cur = conn.execute(
            "INSERT INTO quiz_sessions (video_hash, total_questions) VALUES (?, ?)",
            (video_hash, total),
        )
        conn.commit()
    return {"session_id": cur.lastrowid, "total_questions": total}


@router.post("/api/quiz/sessions/{session_id}/answers")
def submit_answer(session_id: int, body: dict):
    """body: {question_id, choice_id}. Returns whether the pick was correct, plus the
    id of whichever choice IS correct (if one was authored) so the frontend can reveal
    the right answer even when the user picked wrong."""
    question_id = body.get("question_id")
    choice_id = body.get("choice_id")
    if not question_id or not choice_id:
        raise HTTPException(status_code=400, detail="question_id and choice_id are required.")
    with closing(db.get_connection()) as conn:
        choice = conn.execute(
            "SELECT is_correct FROM choices WHERE id = ? AND question_id = ?",
            (choice_id, question_id),
        ).fetchone()
        if choice is None:
            raise HTTPException(status_code=400, detail="choice_id does not belong to question_id.")
        is_correct = bool(choice["is_correct"])
        correct_row = conn.execute(
            "SELECT id FROM choices WHERE question_id = ? AND is_correct = 1", (question_id,)
        ).fetchone()
        conn.execute(
            "INSERT INTO quiz_answers (session_id, question_id, choice_id, is_correct) VALUES (?, ?, ?, ?)",
            (session_id, question_id, choice_id, int(is_correct)),
        )
        conn.execute(
            "UPDATE quiz_sessions SET score = score + ? WHERE id = ?", (1 if is_correct else 0, session_id)
        )
        conn.commit()
    return {"is_correct": is_correct, "correct_choice_id": correct_row["id"] if correct_row else None}


@router.post("/api/quiz/sessions/{session_id}/complete")
def complete_session(session_id: int):
    with closing(db.get_connection()) as conn:
        conn.execute(
            "UPDATE quiz_sessions SET completed_at = datetime('now') WHERE id = ?", (session_id,)
        )
        conn.commit()
    return {"status": "ok"}

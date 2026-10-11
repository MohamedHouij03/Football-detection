"""SQLite persistence for TactiQ: videos, pitch calibration, questions/choices,
and quiz sessions/answers/scores. Single-user app (no auth anywhere in this project
yet) — no user_id column; add one later if multi-user is actually needed.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

DB_PATH = Path("tactiq.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
  video_hash    TEXT PRIMARY KEY,
  display_name  TEXT,
  fps           REAL,
  width         INTEGER,
  height        INTEGER,
  duration      REAL,
  total_frames  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pitch_calibrations (
  video_hash    TEXT PRIMARY KEY REFERENCES videos(video_hash) ON DELETE CASCADE,
  pixel_points  TEXT NOT NULL,   -- JSON [[x,y] x4]
  pitch_points  TEXT NOT NULL,   -- JSON [[x,y] x4] in meters
  homography    TEXT NOT NULL,   -- JSON, flattened 3x3 (9 floats)
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  video_hash           TEXT NOT NULL REFERENCES videos(video_hash) ON DELETE CASCADE,
  timestamp            REAL NOT NULL,
  prompt               TEXT NOT NULL,
  explanation          TEXT NOT NULL,
  reference_track_ids  TEXT,   -- JSON array, e.g. highlight the ball carrier
  difficulty           TEXT NOT NULL DEFAULT 'beginner',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS choices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  is_correct      INTEGER NOT NULL DEFAULT 0,
  order_index     INTEGER NOT NULL DEFAULT 0,
  from_track_id   INTEGER,   -- set together: this choice renders as a pass-line between
  to_track_id     INTEGER    -- two tracked players instead of a text button, when both are set
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  video_hash        TEXT NOT NULL REFERENCES videos(video_hash) ON DELETE CASCADE,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  score             INTEGER NOT NULL DEFAULT 0,
  total_questions   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES questions(id),
  choice_id     INTEGER REFERENCES choices(id) ON DELETE SET NULL,
  is_correct    INTEGER NOT NULL,   -- denormalized at answer time; later question edits
                                     -- must not rewrite past answer history. choice_id
                                     -- itself goes NULL if that choice is later deleted
                                     -- (e.g. Coach edits the question) rather than
                                     -- blocking the edit with a FK error.
  answered_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def get_connection() -> sqlite3.Connection:
    """A fresh connection per call, used with `with closing(get_connection()) as conn:`.
    Avoids sharing one connection across threads/requests — same spirit as _infer_lock
    guarding the one shared model instance elsewhere in this app."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Additive, idempotent migrations for an already-existing tactiq.db — CREATE TABLE
    IF NOT EXISTS alone won't add new columns/constraints to a table that already
    exists, and this app has no separate migration tool, so handle it inline."""
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(choices)")}
    for col in ("from_track_id", "to_track_id"):
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE choices ADD COLUMN {col} INTEGER")

    # SQLite can't ALTER a foreign key's ON DELETE action in place — rebuild the table
    # if quiz_answers.choice_id isn't already SET NULL (fixes: editing a question that
    # already has answers used to hard-fail with a FOREIGN KEY constraint error when
    # its old choices were deleted).
    fk_rows = conn.execute("PRAGMA foreign_key_list(quiz_answers)").fetchall()
    choice_fk = next((r for r in fk_rows if r["table"] == "choices"), None)
    if choice_fk is not None and choice_fk["on_delete"].upper() != "SET NULL":
        conn.executescript("""
            ALTER TABLE quiz_answers RENAME TO quiz_answers_old;
            CREATE TABLE quiz_answers (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id    INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
              question_id   INTEGER NOT NULL REFERENCES questions(id),
              choice_id     INTEGER REFERENCES choices(id) ON DELETE SET NULL,
              is_correct    INTEGER NOT NULL,
              answered_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO quiz_answers SELECT * FROM quiz_answers_old;
            DROP TABLE quiz_answers_old;
        """)


def init_db() -> None:
    with closing(get_connection()) as conn:
        conn.executescript(_SCHEMA)
        _migrate(conn)
        conn.commit()

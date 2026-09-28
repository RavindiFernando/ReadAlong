"""SQLite storage for students and reading sessions. Everything stays local."""

import json
import os
import sqlite3
import time
import uuid

DATA_DIR = os.environ.get("READALONG_DATA", os.path.join(os.path.dirname(__file__), "data"))
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
DB_PATH = os.path.join(DATA_DIR, "readalong.db")

# Columns stored as JSON text on the *sessions* table. save_session() writes
# exactly these columns, so this list must never include a students-only
# field like "insight" - it would try to write a column sessions doesn't have.
SESSION_JSON_FIELDS = ("words", "events", "report", "feedback", "comprehension", "told", "overrides")

# Every JSON-text column across both tables, used only by _row() to parse
# whichever of these keys actually show up in a given row dict.
JSON_FIELDS = SESSION_JSON_FIELDS + ("insight",)

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade INTEGER NOT NULL,
    avatar TEXT NOT NULL,
    color TEXT NOT NULL,
    insight TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    passage_id TEXT NOT NULL,
    created_at REAL NOT NULL,
    words TEXT, events TEXT, report TEXT, feedback TEXT,
    comprehension TEXT, told TEXT, overrides TEXT,
    has_audio INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_student ON sessions(student_id, created_at);
"""


def connect() -> sqlite3.Connection:
    os.makedirs(AUDIO_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for f in JSON_FIELDS:
        if f in d and d[f] is not None:
            d[f] = json.loads(d[f])
    return d


def list_students() -> list[dict]:
    with connect() as c:
        return [_row(r) for r in c.execute("SELECT * FROM students ORDER BY name")]


def get_student(sid: str) -> dict | None:
    with connect() as c:
        return _row(c.execute("SELECT * FROM students WHERE id=?", (sid,)).fetchone())


def create_student(name: str, grade: int, avatar: str, color: str, sid: str | None = None) -> dict:
    s = {"id": sid or new_id(), "name": name, "grade": grade, "avatar": avatar,
         "color": color, "insight": None, "created_at": time.time()}
    with connect() as c:
        c.execute("INSERT INTO students VALUES (:id,:name,:grade,:avatar,:color,:insight,:created_at)", s)
    return s


def set_insight(sid: str, insight: dict) -> None:
    with connect() as c:
        c.execute("UPDATE students SET insight=? WHERE id=?", (json.dumps(insight), sid))


def save_session(s: dict) -> None:
    row = {k: s.get(k) for k in ("id", "student_id", "passage_id", "created_at", "has_audio", "demo")}
    for f in SESSION_JSON_FIELDS:
        row[f] = json.dumps(s.get(f)) if s.get(f) is not None else None
    cols = ",".join(row)
    with connect() as c:
        c.execute(f"INSERT OR REPLACE INTO sessions ({cols}) VALUES ({','.join(':' + k for k in row)})", row)


def update_session(sid: str, **fields) -> None:
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = [json.dumps(v) if k in SESSION_JSON_FIELDS else v for k, v in fields.items()]
    with connect() as c:
        c.execute(f"UPDATE sessions SET {sets} WHERE id=?", (*vals, sid))


def get_session(sid: str) -> dict | None:
    with connect() as c:
        return _row(c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone())


def sessions_for(student_id: str) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT * FROM sessions WHERE student_id=? ORDER BY created_at", (student_id,))
        return [_row(r) for r in rows]


def audio_path(session_id: str) -> str:
    return os.path.join(AUDIO_DIR, f"{session_id}.wav")

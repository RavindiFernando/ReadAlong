"""
ReadAlong API: live reading assessment over WebSocket, plus the REST
endpoints behind the teacher dashboard and the Voice Agent coach.

Run:  uvicorn main:app --port 8000
"""

import asyncio
import json
from contextlib import asynccontextmanager
import os
import time
import wave
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import db  # noqa: E402
import llm  # noqa: E402
from aligner import align, align_live, tokenize  # noqa: E402
from passages import BY_ID, PASSAGES  # noqa: E402
from scoring import apply_marks, benchmark, score  # noqa: E402
from stt import SAMPLE_RATE, ReadingStream  # noqa: E402

@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("SEED_DEMO", "1") == "1" and not db.list_students():
        import seed
        seed.run()
    yield


app = FastAPI(title="ReadAlong", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Passages & students ──────────────────────────────────────────────

@app.get("/api/passages")
def passages():
    return [{**p, "words": len(tokenize(p["text"]))} for p in PASSAGES]


class NewStudent(BaseModel):
    name: str
    grade: int
    avatar: str = "🦊"
    color: str = "#F4A259"


@app.post("/api/students")
def create_student(body: NewStudent):
    if not body.name.strip() or not 1 <= body.grade <= 5:
        raise HTTPException(400, "Name and a grade from 1 to 5 are required")
    return db.create_student(body.name.strip(), body.grade, body.avatar, body.color)


def _summary(session: dict) -> dict:
    p = BY_ID.get(session["passage_id"], {})
    return {
        "id": session["id"], "created_at": session["created_at"],
        "passage_id": session["passage_id"], "title": p.get("title"), "emoji": p.get("emoji"),
        "report": session["report"], "feedback": session["feedback"],
        "comprehension": session["comprehension"], "has_audio": bool(session["has_audio"]),
        "demo": bool(session["demo"]),
    }


@app.get("/api/students")
def students():
    """Everyone, with enough history for the class dashboard."""
    month = datetime.now().month
    out = []
    for s in db.list_students():
        sessions = [_summary(x) for x in db.sessions_for(s["id"])]
        latest = sessions[-1] if sessions else None
        out.append({
            **s,
            "benchmark": benchmark(s["grade"], month),
            "sessions": len(sessions),
            "latest": latest,
            "trend": [{"t": x["created_at"], "wcpm": x["report"]["wcpm"],
                       "accuracy": x["report"]["accuracy"]} for x in sessions],
        })
    return out


@app.get("/api/students/{sid}")
def student(sid: str):
    s = db.get_student(sid)
    if not s:
        raise HTTPException(404, "No such student")
    sessions = [_summary(x) for x in db.sessions_for(sid)]
    missed: dict[str, int] = {}
    for x in sessions:
        for w in x["report"]["tricky_words"]:
            missed[w] = missed.get(w, 0) + 1
    return {**s, "benchmark": benchmark(s["grade"], datetime.now().month), "sessions": sessions,
            "word_bank": sorted(missed.items(), key=lambda kv: -kv[1])[:12]}


@app.post("/api/students/{sid}/insight")
async def insight(sid: str):
    s = db.get_student(sid)
    sessions = db.sessions_for(sid)
    if not s or not sessions:
        raise HTTPException(404, "No readings yet")
    result = await llm.student_insight(s, sessions)
    result["generated_at"] = time.time()
    db.set_insight(sid, result)
    return result


# ── Sessions ─────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}")
def session(sid: str):
    s = db.get_session(sid)
    if not s:
        raise HTTPException(404, "No such session")
    return {**s, "passage": BY_ID[s["passage_id"]], "student": db.get_student(s["student_id"])}


@app.get("/api/sessions/{sid}/audio")
def session_audio(sid: str):
    path = db.audio_path(sid)
    if not os.path.exists(path):
        raise HTTPException(404, "No recording for this session")
    return FileResponse(path, media_type="audio/wav")


class Override(BaseModel):
    status: str | None  # "correct" | "error" | None to undo


@app.patch("/api/sessions/{sid}/words/{index}")
def override_word(sid: str, index: int, body: Override):
    """Teacher-in-the-loop: confirm or overrule the model on one word."""
    s = db.get_session(sid)
    if not s:
        raise HTTPException(404, "No such session")
    overrides = {int(k): v for k, v in (s["overrides"] or {}).items()}
    if body.status is None:
        overrides.pop(index, None)
    elif body.status in ("correct", "error"):
        overrides[index] = body.status
    else:
        raise HTTPException(400, "status must be correct, error or null")
    student = db.get_student(s["student_id"])
    words = apply_marks(s["words"], set(s["told"] or []), overrides)
    report = score(words, s["events"], student["grade"], datetime.fromtimestamp(s["created_at"]).month)
    db.update_session(sid, words=words, overrides=overrides, report=report)
    return {"words": words, "report": report, "overrides": overrides}


class Comprehension(BaseModel):
    retell: str
    questions_correct: int
    questions_total: int = 2
    notes: str = ""
    transcript: list[dict] = []


@app.post("/api/sessions/{sid}/comprehension")
def comprehension(sid: str, body: Comprehension):
    if not db.get_session(sid):
        raise HTTPException(404, "No such session")
    db.update_session(sid, comprehension=body.model_dump())
    return {"ok": True}


# ── Voice Agent (Talk with Pip) ──────────────────────────────────────

@app.get("/api/voice-token")
async def voice_token():
    """Single-use token so the browser can open a Voice Agent session
    without ever seeing the API key."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://agents.assemblyai.com/v1/token",
            params={"expires_in_seconds": 120, "max_session_duration_seconds": 600},
            headers={"Authorization": f"Bearer {os.environ['ASSEMBLYAI_API_KEY']}"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Voice token failed: {r.text[:200]}")
    return {"token": r.json()["token"]}


# ── Live reading ─────────────────────────────────────────────────────

def _live_words(words: list[dict]) -> list[dict]:
    return [{"i": w["i"], "status": w["status"]} for w in words]


@app.websocket("/ws/read")
async def read_ws(ws: WebSocket):
    """
    Client → server: {"type":"start", "mode":"read", "student_id", "passage_id"}
                     or {"type":"start", "mode":"practice", "word"}
                     then binary PCM16 mono 16 kHz chunks (50-1000 ms each)
                     {"type":"told", "index"}  (child got stuck, Pip said the word)
                     {"type":"stop"}
    Server → client: ready, progress (live word states), report, feedback,
                     practice_result, error
    """
    await ws.accept()
    start = await ws.receive_json()
    mode = start.get("mode", "read")
    if mode == "practice":
        tokens, student, passage = tokenize(start.get("word", "")), None, None
    else:
        student = db.get_student(start.get("student_id", ""))
        passage = BY_ID.get(start.get("passage_id", ""))
        tokens = tokenize(passage["text"]) if passage else []
    if not tokens or (mode == "read" and not student):
        await ws.send_json({"type": "error", "message": "Unknown student or passage"})
        await ws.close()
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    stream = ReadingStream(loop, queue)
    try:
        await asyncio.to_thread(stream.connect)
    except Exception as e:
        await ws.send_json({"type": "error", "message": f"Could not reach AssemblyAI: {e}"})
        await ws.close()
        return

    session_id = db.new_id()
    audio = bytearray()
    told: set[int] = set()
    started = time.time()
    await ws.send_json({"type": "ready", "session_id": session_id, "tokens": tokens})

    async def pump():
        while True:
            kind, payload = await queue.get()
            if kind == "error":
                await ws.send_json({"type": "error", "message": payload})
                continue
            settled, partial = stream.words()
            r = align_live(tokens, settled, partial)
            words = apply_marks(r["words"], told, {})
            await ws.send_json({"type": "progress", "words": _live_words(words),
                                "cursor": r["cursor"], "partial": " ".join(w["text"] for w in partial),
                                "events": r["events"][-4:]})

    pump_task = asyncio.create_task(pump())
    disconnected = False
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                disconnected = True
                break
            if msg.get("bytes"):
                audio.extend(msg["bytes"])
                stream.send(msg["bytes"])
            elif msg.get("text"):
                data = json.loads(msg["text"])
                if data.get("type") == "stop":
                    break
                if data.get("type") == "told":
                    told.add(int(data["index"]))
    except WebSocketDisconnect:
        disconnected = True
    finally:
        await asyncio.to_thread(stream.close)
        await asyncio.sleep(0.05)  # let the final turn reach the queue
        pump_task.cancel()

    if disconnected:
        return

    settled, partial = stream.words()
    settled += partial  # a turn cut off by stop is still what the child read
    r = align(tokens, settled, final=True)
    words = apply_marks(r["words"], told, {})

    if mode == "practice":
        w = words[0]
        await ws.send_json({"type": "practice_result", "word": tokens[0],
                            "correct": w["status"] in ("correct", "check"),
                            "heard": " ".join(x["text"] for x in settled)})
        await ws.close()
        return

    month = datetime.now().month
    report = score(words, r["events"], student["grade"], month)
    if audio:
        with wave.open(db.audio_path(session_id), "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(SAMPLE_RATE)
            f.writeframes(bytes(audio))
    session = {"id": session_id, "student_id": student["id"], "passage_id": passage["id"],
               "created_at": started, "words": words, "events": r["events"], "report": report,
               "told": sorted(told), "overrides": {}, "has_audio": int(bool(audio)), "demo": 0}
    db.save_session(session)
    await ws.send_json({"type": "report", "session_id": session_id, "report": report,
                        "words": words, "events": r["events"]})

    feedback = await llm.reading_feedback(student["name"], student["grade"], passage,
                                          report, words, r["events"])
    db.update_session(session_id, feedback=feedback)
    await ws.send_json({"type": "feedback", "feedback": feedback})
    await ws.close()


# ── Frontend (production build) ──────────────────────────────────────

DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/", StaticFiles(directory=DIST, html=True), name="app")

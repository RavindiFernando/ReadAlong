"""
Teacher-facing analysis through AssemblyAI's LLM Gateway.

Safety rule: nothing an LLM writes freely is shown or spoken to a child.
The child's message is built from facts (what they read, fixed or missed).
LLM output is for adults, and it is grounded: a note that quotes a word the
child didn't actually miss is rejected and replaced with a factual fallback.
"""

import asyncio
import json
import os
import re

import httpx

GATEWAY = "https://llm-gateway.assemblyai.com/v1/chat/completions"
MODEL = os.environ.get("LLM_MODEL", "qwen3.5-4b-32k-fast")


async def _chat(system: str, user: str, max_tokens: int = 500) -> dict | None:
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    GATEWAY,
                    headers={"authorization": os.environ["ASSEMBLYAI_API_KEY"]},
                    json={"model": MODEL, "max_tokens": max_tokens,
                          "messages": [{"role": "system", "content": system},
                                       {"role": "user", "content": user}]},
                )
            if r.status_code == 429 and attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
            match = re.search(r"\{.*\}", text, re.S)
            return json.loads(match.group(0)) if match else None
        except Exception as e:  # network, auth, bad JSON: fall back
            print(f"LLM gateway fallback: {e}")
            return None
    return None


def _clean(word: str) -> str:
    return word.strip(".,!?;:\"'”’“‘()—-").lower()


def _grounded(text: str, allowed: set[str]) -> bool:
    """Every quoted word in the text must be one the child actually read or said."""
    quoted = re.findall(r"['‘\"“]([A-Za-z][A-Za-z'\-]*)['’\"”]", text)
    return all(_clean(q) in allowed for q in quoted)


def _miscues(words: list[dict], events: list[dict]) -> list[str]:
    lines = []
    for w in words:
        if w["status"] == "error":
            lines.append(f"read '{_clean(w['text'])}' as '{_clean(w.get('heard', ''))}'")
        elif w["status"] == "skipped":
            lines.append(f"skipped '{_clean(w['text'])}'")
        elif w["status"] == "told":
            lines.append(f"got stuck on '{_clean(w['text'])}' and was told the word")
    for e in events:
        if e["type"] == "self_correction":
            lines.append(f"started to say '{_clean(e['text'])}' then self-corrected")
        elif e["type"] == "hesitation":
            lines.append(f"paused before '{_clean(e['text'])}'")
    return lines


def kid_message(name: str, report: dict, events: list[dict]) -> str:
    """Two short, true sentences for the child. Pip speaks this aloud."""
    fixed = [e for e in events if e["type"] == "self_correction"]
    if report["stars"] == 3:
        first = f"Wow, {name}, you read that story so carefully!"
    elif fixed:
        first = f"{name}, I loved how you fixed a tricky word all by yourself!"
    else:
        first = f"Great job reading the whole story, {name}!"
    tricky = report["tricky_words"]
    second = (f"Let's practice the word '{tricky[0]}' together." if tricky
              else "You're becoming a super reader.")
    return f"{first} {second}"


async def reading_feedback(name: str, grade: int, passage: dict, report: dict,
                           words: list[dict], events: list[dict]) -> dict:
    miscues = _miscues(words, events)
    fallback = {
        "teacher_note": (
            f"{report['accuracy']}% accuracy ({report['level']} level), {report['wcpm']} WCPM. "
            + (f"Missed: {', '.join(report['tricky_words'])}. " if report["tricky_words"] else "No uncorrected errors. ")
            + (f"{report['self_corrections']} self-correction(s) show active monitoring." if report["self_corrections"] else "")
        ).strip(),
        "focus_skill": "word accuracy" if report["tricky_words"] else "reading with expression",
    }
    result = {"kid_message": kid_message(name, report, events), **fallback, "source": "rules"}
    if not miscues:
        return result

    system = (
        "You are an experienced literacy specialist writing a running-record note for a teacher. "
        'Reply with JSON only, no markdown: {"teacher_note": str, "focus_skill": str}. '
        "teacher_note: 2 sentences. Name the actual missed words and what the child said instead, "
        "the pattern only if it is obvious from those words (for example a dropped -ly ending), "
        "and one concrete next step. Only mention words from the miscue list. Never invent errors. "
        "focus_skill: 2-4 words, one skill."
    )
    user = (
        f"Grade {grade}. Passage: \"{passage['title']}\". {report['wcpm']} WCPM "
        f"(benchmark {report['benchmark']}), {report['accuracy']}% accuracy.\n"
        "Miscues:\n- " + "\n- ".join(miscues)
    )
    out = await _chat(system, user)
    allowed = {_clean(w["text"]) for w in words} | {_clean(w.get("heard", "")) for w in words} \
        | {_clean(e["text"]) for e in events}
    if out and isinstance(out.get("teacher_note"), str) and isinstance(out.get("focus_skill"), str) \
            and _grounded(out["teacher_note"], allowed):
        result.update(teacher_note=out["teacher_note"], focus_skill=out["focus_skill"][:40], source="llm")
    return result


async def student_insight(student: dict, sessions: list[dict]) -> dict:
    history, missed = [], set()
    for s in sessions[-8:]:
        r = s["report"]
        missed |= set(r.get("tricky_words", []))
        history.append(f"- {r['wcpm']} WCPM, {r['accuracy']}% accuracy, missed: "
                       f"{', '.join(r.get('tricky_words', [])) or 'none'}")
    first, last = sessions[0]["report"], sessions[-1]["report"]
    fallback = {
        "summary": f"{student['name']} moved from {first['wcpm']} to {last['wcpm']} WCPM over {len(sessions)} readings.",
        "patterns": [],
        "next_steps": ["Repeated reading of a familiar passage", "Practice the missed words as flashcards"],
        "source": "rules",
    }
    system = (
        "You are a literacy specialist writing for a busy classroom teacher. Reply with JSON only, "
        'no markdown: {"summary": str, "patterns": [str], "next_steps": [str]}. '
        "summary: 1-2 sentences on the WCPM and accuracy trend using the real numbers; say 'they' for the student. "
        "patterns: up to 3 patterns you can actually see in the missed words (quote them). "
        "next_steps: 2 concrete, small classroom activities. Never invent words or numbers."
    )
    # No names in LLM prompts: the teacher already knows who this is.
    user = (f"A grade {student['grade']} student. Recent readings, oldest first:\n"
            + "\n".join(history))
    out = await _chat(system, user, max_tokens=600)
    if not out or not isinstance(out.get("summary"), str):
        return fallback
    patterns = [p for p in out.get("patterns", []) if isinstance(p, str) and _grounded(p, missed)]
    steps = [s for s in out.get("next_steps", []) if isinstance(s, str)][:3]
    return {"summary": out["summary"], "patterns": patterns[:3],
            "next_steps": steps or fallback["next_steps"], "source": "llm"}

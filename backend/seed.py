"""
Seeds a demo class so the teacher dashboard has history on first run.
Readings are synthetic (marked demo=1) but go through the real aligner and
scorer, so every number on screen is computed the same way as a live read.

Run directly to reset:  python seed.py --reset
"""

import os
import random
import sys
import time
from datetime import datetime

import db
from aligner import align, tokenize
from passages import PASSAGES
from scoring import apply_marks, score

# name, grade, avatar, color, starting WCPM, WCPM gain per reading, error habit, error rate
CLASS = [
    ("Maya", 2, "🦊", "#F4A259", 36, 3, "suffix", 0.45),
    ("Leo", 2, "🐯", "#E9C46A", 56, 2, "vowel", 0.10),
    ("Aisha", 3, "🐼", "#8AB17D", 88, 3, "skip", 0.06),
    ("Noah", 1, "🐸", "#2A9D8F", 13, 2, "vowel", 0.30),
    ("Sofia", 3, "🦄", "#B392AC", 60, 2, "suffix", 0.35),
    ("Kai", 4, "🐙", "#5E8BC4", 98, 3, "skip", 0.04),
]

VOWEL_SWAPS = [("ea", "e"), ("ai", "a"), ("oa", "o"), ("ee", "e"), ("ou", "o"), ("i", "a")]


def misread(word: str, habit: str, rng: random.Random) -> str | None:
    """Return what the child says instead, or None to skip the word."""
    bare = word.strip(".,!?;:").lower()
    if habit == "suffix":
        for suf in ("ly", "ed", "ing", "s"):
            if bare.endswith(suf) and len(bare) > len(suf) + 2:
                return bare[: -len(suf)]
    if habit == "vowel":
        for a, b in VOWEL_SWAPS:
            if a in bare:
                return bare.replace(a, b, 1)
    if habit == "skip" and 2 < len(bare) <= 4:
        return None
    return bare  # the habit doesn't apply to this word: read it correctly


def synthetic_read(passage: dict, wcpm: float, habit: str, rate: float, rng: random.Random):
    tokens = tokenize(passage["text"])
    per_word = 60_000 / max(wcpm, 10)
    spoken, t = [], 0
    for tok in tokens:
        t += per_word * rng.uniform(0.7, 1.3)
        if rng.random() < rate:
            said = misread(tok, habit, rng)
            if said is None:
                continue
            spoken.append({"text": said, "start": int(t), "end": int(t + 250), "confidence": 0.97})
            if rng.random() < 0.3:  # sometimes they fix it
                t += per_word * 0.8
                spoken.append({"text": tok, "start": int(t), "end": int(t + 250), "confidence": 0.98})
        else:
            spoken.append({"text": tok, "start": int(t), "end": int(t + 250), "confidence": rng.uniform(0.9, 1.0)})
    return tokens, spoken


def run():
    rng = random.Random(7)
    now = time.time()
    for name, grade, avatar, color, wcpm0, gain, habit, rate in CLASS:
        student = db.create_student(name, grade, avatar, color)
        pool = [p for p in PASSAGES if abs(p["grade"] - grade) <= 1] or PASSAGES
        n = rng.randint(5, 7)
        for k in range(n):
            passage = pool[k % len(pool)]
            created = now - (n - k) * 6 * 86400 - rng.randint(0, 20000)
            wcpm = wcpm0 + gain * k + rng.uniform(-4, 4)
            err = max(0.0, rate * (1 - 0.08 * k))
            _, spoken = synthetic_read(passage, wcpm, habit, err, rng)
            r = align(tokenize(passage["text"]), spoken, final=True)
            words = apply_marks(r["words"], set(), {})
            report = score(words, r["events"], grade, datetime.fromtimestamp(created).month)
            feedback = {
                "kid_message": f"Nice reading, {name}!",
                "teacher_note": f"{report['accuracy']}% accuracy, {report['wcpm']} WCPM. "
                                + (f"Missed: {', '.join(report['tricky_words'])}." if report["tricky_words"] else "No uncorrected errors."),
                "focus_skill": {"suffix": "word endings (-ed, -ly)", "vowel": "vowel teams",
                                "skip": "tracking small words"}[habit],
            }
            comp = None
            if rng.random() < 0.6:
                qc = rng.choice([1, 2, 2])
                comp = {"retell": rng.choice(["complete", "partial"]) if qc == 2 else "partial",
                        "questions_correct": qc, "questions_total": 2, "notes": "", "transcript": []}
            db.save_session({
                "id": db.new_id(), "student_id": student["id"], "passage_id": passage["id"],
                "created_at": created, "words": words, "events": r["events"], "report": report,
                "feedback": feedback, "comprehension": comp, "told": [], "overrides": {},
                "has_audio": 0, "demo": 1,
            })
    print(f"Seeded demo class: {len(CLASS)} students")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        if os.path.exists(db.DB_PATH):
            os.remove(db.DB_PATH)
        if os.path.isdir(db.AUDIO_DIR):
            for f in os.listdir(db.AUDIO_DIR):
                os.remove(os.path.join(db.AUDIO_DIR, f))
    run()

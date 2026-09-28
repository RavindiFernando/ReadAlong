import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from aligner import align, tokenize
from scoring import apply_marks, score

PASSAGE = "The enormous elephant walked slowly through the quiet forest, looking for water. She was very thirsty."


def stream(pairs, gap=300, pauses=None):
    """Build a fake AssemblyAI word list: [(text, confidence), ...]."""
    pauses = pauses or {}
    out, t = [], 0
    for k, (text, conf) in enumerate(pairs):
        t += pauses.get(k, 0)
        out.append({"text": text, "start": t, "end": t + gap, "confidence": conf})
        t += gap + 50
    return out


def statuses(result):
    return {w["text"]: w["status"] for w in result["words"]}


# Real universal-3-6-pro output for a scripted misreading (see README).
REAL = [("The,", 0.66), ("the", 1.0), ("enor—", 0.67), ("enormous", 1.0), ("elephant", 1.0),
        ("walked", 1.0), ("slow", 1.0), ("through", 1.0), ("the", 1.0), ("quiet", 1.0),
        ("forest,", 0.97), ("looking", 1.0), ("for,", 0.96), ("for", 1.0), ("water.", 1.0),
        ("She", 1.0), ("was", 1.0), ("very", 1.0), ("thirsty.", 0.99)]


def test_real_misreading():
    r = align(tokenize(PASSAGE), stream(REAL), final=True)
    s = statuses(r)
    assert s["slowly"] == "error"
    assert s["enormous"] == "correct"
    assert s["thirsty."] == "correct"
    kinds = [e["type"] for e in r["events"]]
    assert kinds.count("repetition") == 2
    assert "self_correction" in kinds
    assert r["cursor"] == len(tokenize(PASSAGE))


def test_unsure_mismatch_goes_to_teacher():
    words = [(w, 1.0) for w in PASSAGE.split()]
    words[3] = ("wok", 0.62)
    s = statuses(align(tokenize(PASSAGE), stream(words), final=True))
    assert s["walked"] == "check"


def test_live_tail_is_pending_not_skipped():
    r = align(tokenize(PASSAGE), stream([(w, 1.0) for w in PASSAGE.split()[:4]]))
    assert r["cursor"] == 4
    assert r["words"][4]["status"] == "pending"
    final = align(tokenize(PASSAGE), stream([(w, 1.0) for w in PASSAGE.split()[:4]]), final=True)
    assert final["words"][4]["status"] == "not_reached"


def test_skipped_phrase_and_lone_short_word():
    spoken = PASSAGE.split()
    del spoken[5:8]            # "through the quiet"
    r = align(tokenize(PASSAGE), stream([(w, 1.0) for w in spoken]), final=True)
    assert [w["status"] for w in r["words"][5:8]] == ["skipped"] * 3

    spoken = PASSAGE.split()
    del spoken[0]              # lone "The"
    r = align(tokenize(PASSAGE), stream([(w, 1.0) for w in spoken]), final=True)
    assert r["words"][0]["status"] == "check"


def test_hesitation_but_not_at_sentence_end():
    words = [(w, 1.0) for w in PASSAGE.split()]
    r = align(tokenize(PASSAGE), stream(words, pauses={4: 2500, 12: 2500}), final=True)
    hes = [e["text"] for e in r["events"] if e["type"] == "hesitation"]
    assert hes == ["slowly"]   # the pause before "She" follows "water."


def test_score_counts_told_and_overrides():
    tokens = tokenize(PASSAGE)
    r = align(tokens, stream(REAL), final=True)
    words = apply_marks(r["words"], told={2}, overrides={4: "correct"})
    rep = score(words, r["events"], grade=2, month=10)
    assert words[2]["status"] == "told"
    assert words[4]["status"] == "correct" and words[4]["teacher"]
    assert rep["errors"] == 1
    assert rep["attempted"] == len(tokens)
    assert rep["tricky_words"] == ["elephant"]
    assert rep["benchmark"] == 50
    assert rep["accuracy"] == 93.8 and rep["level"] == "instructional"
    assert rep["stars"] == 2


def test_live_partial_lights_green_but_never_red_or_far_ahead():
    from aligner import align_live
    tokens = tokenize(PASSAGE)
    settled = stream([(w, 1.0) for w in PASSAGE.split()[:3]])
    partial = stream([("walked", 0.9), ("slow", 0.9)])
    r = align_live(tokens, settled, partial)
    assert r["words"][3]["status"] == "correct"      # partial match shows instantly
    assert r["words"][4]["status"] == "pending"      # partial mismatch waits
    assert r["cursor"] == 4

    far = stream([("forest,", 0.9)])                  # a stray partial word
    r = align_live(tokens, settled, far)
    assert r["words"][8]["status"] == "pending"
    assert r["cursor"] == 3


def test_digits_match_spelled_numbers():
    from passages import BY_ID
    text = BY_ID["brave-little-lighthouse"]["text"]
    tokens = tokenize(text)
    said = " ".join(tokens).replace("forty", "40").replace("one hundred and twelve", "112").split()
    r = align(tokens, stream([(w, 1.0) for w in said]), final=True)
    assert all(w["status"] == "correct" for w in r["words"])


def test_student_insight_round_trips_as_object(tmp_path, monkeypatch):
    """Regression: insight must come back as a dict, not a raw JSON string
    (a string here made the teacher page crash trying to call .map() on it)."""
    monkeypatch.setenv("READALONG_DATA", str(tmp_path))
    import importlib
    import db
    importlib.reload(db)
    s = db.create_student("Test Kid", 2, "🦊", "#fff")
    db.set_insight(s["id"], {"summary": "doing great", "patterns": [], "next_steps": ["practice more"]})
    fetched = db.get_student(s["id"])
    assert isinstance(fetched["insight"], dict)
    assert fetched["insight"]["next_steps"] == ["practice more"]


def test_save_session_never_writes_a_students_only_column(tmp_path, monkeypatch):
    """Regression: save_session() must only ever write real `sessions` columns.
    Adding a students-only field (like "insight") to JSON_FIELDS previously
    made this crash the whole app on startup, since seed.run() calls
    save_session() for every demo reading."""
    monkeypatch.setenv("READALONG_DATA", str(tmp_path))
    import importlib
    import db
    importlib.reload(db)
    db.create_student("Test Kid", 2, "🦊", "#fff", sid="stu1")
    db.save_session({
        "id": "sess1", "student_id": "stu1", "passage_id": "big-red-hen",
        "created_at": 0.0, "words": [], "events": [], "report": {"wcpm": 1},
        "feedback": None, "comprehension": None, "told": [], "overrides": {},
        "has_audio": 0, "demo": 1,
    })
    assert db.get_session("sess1")["report"] == {"wcpm": 1}

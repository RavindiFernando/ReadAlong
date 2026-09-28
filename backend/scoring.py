"""
Turns aligned words into the numbers a teacher records in a running
record: words correct per minute (WCPM), accuracy, reading level and
benchmark status.
"""

# Oral reading fluency, 50th percentile WCPM (Hasbrouck & Tindal, 2017),
# by grade and season. Used as a reference line, not a diagnosis.
ORF_NORMS = {
    1: {"fall": None, "winter": 29, "spring": 60},
    2: {"fall": 50, "winter": 84, "spring": 100},
    3: {"fall": 83, "winter": 97, "spring": 112},
    4: {"fall": 94, "winter": 120, "spring": 133},
    5: {"fall": 121, "winter": 133, "spring": 146},
}

ERROR_STATUSES = {"error", "skipped", "told"}


def season(month: int) -> str:
    if month in (8, 9, 10, 11):
        return "fall"
    if month in (12, 1, 2, 3):
        return "winter"
    return "spring"


def benchmark(grade: int, month: int) -> int | None:
    norms = ORF_NORMS.get(max(1, min(5, grade)), {})
    return norms.get(season(month)) or norms.get("winter")


def apply_marks(words: list[dict], told: set[int], overrides: dict[int, str]) -> list[dict]:
    """Stuck-word rescues and teacher decisions win over the model.
    The model's own verdict is kept in "model" so overrides can be undone."""
    for w in words:
        w.setdefault("model", w["status"])
        w["status"] = w["model"]
        w.pop("teacher", None)
        if w["i"] in told:
            w["status"] = "told"
        if w["i"] in overrides:
            w["status"] = overrides[w["i"]]
            w["teacher"] = True
    return words


def score(words: list[dict], events: list[dict], grade: int, month: int) -> dict:
    attempted = [w for w in words if w["status"] not in ("pending", "not_reached")]
    n = len(attempted)
    errors = sum(w["status"] in ERROR_STATUSES for w in attempted)
    errors += sum(e["type"] == "insertion" for e in events)
    checks = sum(w["status"] == "check" for w in attempted)

    timed = [w for w in words if "start" in w]
    if timed:
        seconds = max(1.0, (timed[-1]["end"] - timed[0]["start"]) / 1000)
    else:
        seconds = 0.0

    correct = max(0, n - errors)
    wcpm = round(correct / (seconds / 60)) if seconds else 0
    accuracy = round(100 * correct / n, 1) if n else 0.0

    if accuracy >= 95:
        level = "independent"
    elif accuracy >= 90:
        level = "instructional"
    else:
        level = "frustration"

    target = benchmark(grade, month)
    if target is None or not n:
        status = "unknown"
    elif wcpm >= target:
        status = "on_track"
    elif wcpm >= 0.8 * target:
        status = "monitor"
    else:
        status = "support"

    tricky, seen = [], set()
    for w in attempted:
        key = w["text"].strip(".,!?;:\"'”’“‘()").lower()
        if w["status"] in ERROR_STATUSES and key not in seen:
            seen.add(key)
            tricky.append(key)

    return {
        "attempted": n,
        "total": len(words),
        "errors": errors,
        "checks": checks,
        "seconds": round(seconds, 1),
        "wcpm": wcpm,
        "accuracy": accuracy,
        "level": level,
        "benchmark": target,
        "status": status,
        "stars": 3 if accuracy >= 95 else 2 if accuracy >= 85 else 1,
        "self_corrections": sum(e["type"] == "self_correction" for e in events),
        "repetitions": sum(e["type"] == "repetition" for e in events),
        "hesitations": sum(e["type"] == "hesitation" for e in events),
        "tricky_words": tricky[:6],
    }

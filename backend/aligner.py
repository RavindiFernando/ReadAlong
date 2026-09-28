"""
Aligns what a child actually said (AssemblyAI word stream) against the
passage they were supposed to read, and labels every passage word.

Design rule: never tell a child they were wrong unless we are sure.
A mismatch the speech model was confident about is a reading error.
A mismatch it was unsure about is flagged "check" for the teacher, who
can replay the audio and decide.
"""

import difflib
import re
import unicodedata

# A misread word must come back at or above this confidence to count as an
# error. Real misreads come back ~1.0 in our tests, while transcription
# slips on correctly read words landed in the 0.6-0.8 range.
SURE = 0.85

# Silence (ms) before a word that counts as a hesitation, unless the
# previous passage word ends a sentence (a natural pause).
HESITATION_MS = 2000

SENTENCE_END = re.compile(r"[.!?]['\"”’)]*$")


def norm(word: str) -> str:
    word = unicodedata.normalize("NFKD", word.lower().replace("’", "'"))
    return "".join(c for c in word if c.isalnum() or c == "'").strip("'")


def tokenize(passage: str) -> list[str]:
    return [t for t in passage.split() if norm(t)]


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen " \
       "fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> list[str]:
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        rest = n % 100
        return [ONES[n // 100], "hundred"] + (["and"] + number_words(rest) if rest else [])
    rest = n % 1000
    return number_words(n // 1000) + ["thousand"] + (number_words(rest) if rest else [])


def expand_numbers(spoken: list[dict]) -> list[dict]:
    """The STT writes "3" or "112"; passages spell numbers out. Split the
    digits into words that share the original word's time span."""
    out = []
    for w in spoken:
        digits = norm(w["text"])
        if not digits.isdigit() or int(digits) > 9999:
            out.append(w)
            continue
        parts = number_words(int(digits))
        step = (w["end"] - w["start"]) / len(parts)
        for k, p in enumerate(parts):
            out.append({**w, "text": p, "start": int(w["start"] + k * step),
                        "end": int(w["start"] + (k + 1) * step)})
    return out


def similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def align(tokens: list[str], spoken: list[dict], final: bool = False) -> dict:
    """
    tokens: passage words as displayed.
    spoken: [{text, start, end, confidence}] in the order they were heard.
    final:  True once the child has stopped; unread tail becomes
            "not_reached" instead of staying "pending".

    Returns {"words": [...], "events": [...], "cursor": int}
    Word status: correct | error | skipped | check | pending | not_reached
    """
    P = [norm(t) for t in tokens]
    heard = [w for w in expand_numbers(spoken) if norm(w["text"])]
    S = [norm(w["text"]) for w in heard]

    words = [{"i": i, "text": t, "status": "pending"} for i, t in enumerate(tokens)]
    events: list[dict] = []

    def attach(i, j, status):
        w = heard[j]
        words[i].update(status=status, j=j, heard=w["text"], start=w["start"],
                        end=w["end"], confidence=round(w["confidence"], 2))

    def extra(j, i_next):
        """Classify a spoken word that has no passage slot of its own."""
        x, w = S[j], heard[j]
        prev_spoken = S[j - 1] if j else ""
        prev_word = P[i_next - 1] if i_next else ""
        nxt = P[i_next] if i_next < len(P) else ""
        if x in (prev_spoken, prev_word):
            kind = "repetition"
        elif nxt and (nxt.startswith(x) or similar(x, nxt) >= 0.6):
            kind = "self_correction"
        elif w["confidence"] >= SURE:
            kind = "insertion"
        else:
            return  # low-confidence noise, ignore
        events.append({"type": kind, "index": min(i_next, len(P) - 1),
                       "text": w["text"], "start": w["start"]})

    sm = difflib.SequenceMatcher(None, P, S, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                attach(i1 + k, j1 + k, "correct")
        elif op == "replace":
            n = min(i2 - i1, j2 - j1)
            for k in range(n):
                conf = heard[j1 + k]["confidence"]
                attach(i1 + k, j1 + k, "error" if conf >= SURE else "check")
            for i in range(i1 + n, i2):
                words[i]["status"] = "skipped"
            for j in range(j1 + n, j2):
                extra(j, i2)
        elif op == "delete":
            for i in range(i1, i2):
                words[i]["status"] = "skipped"
        elif op == "insert":
            for j in range(j1, j2):
                extra(j, i1)

    # Words after the last one the child reached are not skipped, just unread.
    reached = [w["i"] for w in words if "heard" in w]
    last = reached[-1] if reached else -1
    for w in words[last + 1:]:
        w["status"] = "not_reached" if final else "pending"

    # A lone skipped short word (a, the, is) is as likely a transcription
    # drop as a real omission, so the teacher decides.
    for w in words:
        if w["status"] == "skipped" and len(norm(w["text"])) <= 3:
            left = words[w["i"] - 1]["status"] if w["i"] else "correct"
            right = words[w["i"] + 1]["status"] if w["i"] + 1 < len(words) else "correct"
            if left != "skipped" and right != "skipped":
                w["status"] = "check"

    # Hesitations: long silence before a word, not at a sentence boundary.
    prev_end = None
    for w in words:
        if "start" not in w:
            continue
        if prev_end is not None and w["start"] - prev_end >= HESITATION_MS:
            before = tokens[w["i"] - 1] if w["i"] else ""
            if not SENTENCE_END.search(before):
                w["hesitation_ms"] = w["start"] - prev_end
                events.append({"type": "hesitation", "index": w["i"],
                               "text": w["text"], "start": w["start"]})
        prev_end = w["end"]

    events.sort(key=lambda e: e["start"])
    return {"words": words, "events": events, "cursor": last + 1}


def align_live(tokens: list[str], settled: list[dict], partial: list[dict]) -> dict:
    """
    Live view while the child is mid-sentence. Partial words can still
    change, so a partial match lights up green right away (instant, encouraging
    feedback) but a partial mismatch stays pending until the turn settles.
    Nothing flashes red and then turns green again.
    """
    r = align(tokens, settled + partial)
    first_partial = len([w for w in expand_numbers(settled) if norm(w["text"])])
    confirmed = max((w["i"] for w in r["words"] if w.get("j", -1) in range(first_partial)), default=-1)
    reach = confirmed + len(partial) + 2  # a partial can't jump further than it has words
    for w in r["words"]:
        if w.get("j", -1) >= first_partial and (w["status"] != "correct" or w["i"] > reach):
            w["status"] = "pending"
        elif w["status"] == "skipped" and not any(
            x.get("j", -1) < first_partial for x in r["words"][w["i"] + 1:] if "j" in x
        ):
            w["status"] = "pending"  # the skip is only implied by unsettled words
    r["events"] = [e for e in r["events"] if e["start"] < (partial[0]["start"] if partial else 1e12)]
    shown = [w["i"] for w in r["words"] if w["status"] != "pending"]
    r["cursor"] = shown[-1] + 1 if shown else 0
    return r

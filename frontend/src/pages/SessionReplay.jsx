import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import Passage, { Legend } from "../components/Passage";

const STATUS_TEXT = {
  correct: "Read correctly",
  error: "Misread",
  skipped: "Skipped",
  told: "Pip said the word (child was stuck)",
  check: "Uncertain: the model wasn't sure, please listen",
  not_reached: "Not reached",
  pending: "Not reached",
};

const EVENT_TEXT = {
  self_correction: (e) => `Self-corrected after “${e.text}”`,
  repetition: (e) => `Repeated “${e.text}”`,
  insertion: (e) => `Added “${e.text}”`,
  hesitation: (e) => `Paused before “${e.text}”`,
};

function clean(t) {
  return t.replace(/[.,!?;:"“”]/g, "");
}

export default function SessionReplay({ sessionId }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(-1);
  const audio = useRef(null);
  const stopAt = useRef(null);

  useEffect(() => {
    api.session(sessionId).then(setS).catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!s) return <div className="spinner" />;

  const tokens = s.passage.text.split(/\s+/);
  const r = s.report;
  const checks = s.words.filter((w) => w.status === "check" || (w.teacher && w.model === "check"));

  const play = (i) => {
    const w = s.words[i];
    setSelected(i);
    if (!s.has_audio || w.start == null || !audio.current) return;
    audio.current.currentTime = Math.max(0, w.start / 1000 - 0.25);
    stopAt.current = w.end / 1000 + 0.35;
    setPlaying(i);
    audio.current.play();
  };

  const onTime = () => {
    if (stopAt.current && audio.current.currentTime >= stopAt.current) {
      audio.current.pause();
      stopAt.current = null;
      setPlaying(-1);
    }
  };

  const decide = async (i, status) => {
    const out = await api.overrideWord(sessionId, i, status);
    setS({ ...s, words: out.words, report: out.report, overrides: out.overrides });
  };

  const sel = selected != null ? s.words[selected] : null;

  return (
    <>
      <a className="back no-print" href={`#/teacher/${s.student.id}`}>
        ← {s.student.name}
      </a>
      <div className="spread" style={{ marginBottom: 20 }}>
        <div>
          <p className="muted small" style={{ margin: 0 }}>
            {s.student.name} · Grade {s.student.grade} ·{" "}
            {new Date(s.created_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <h1>
            {s.passage.emoji} {s.passage.title}
          </h1>
        </div>
        <div className="row">
          {s.demo ? <span className="chip demo">demo reading (no audio)</span> : <span className="chip live">🎧 recorded live</span>}
          <button className="btn ghost no-print" onClick={() => print()}>
            🖨 Print running record
          </button>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="v">{r.wcpm}</div>
          <div className="k">WCPM (benchmark {r.benchmark ?? "n/a"})</div>
        </div>
        <div className="stat">
          <div className="v">{r.accuracy}%</div>
          <div className="k">accuracy · {r.level}</div>
        </div>
        <div className="stat">
          <div className="v">{r.errors}</div>
          <div className="k">errors of {r.attempted} words</div>
        </div>
        <div className="stat">
          <div className="v">{r.self_corrections}</div>
          <div className="k">self-corrections</div>
        </div>
        <div className="stat">
          <div className="v">{r.seconds}s</div>
          <div className="k">reading time</div>
        </div>
      </div>

      <div className="two-col">
        <div className="stack">
          <article className="page">
            <div className="spread" style={{ marginBottom: 8 }}>
              <span className="small muted">{s.has_audio ? "Click any word to hear exactly how it was read." : "Click any word for details."}</span>
              <Legend teacher />
            </div>
            <Passage tokens={tokens} words={s.words} playing={playing} onWord={play} />
          </article>
          {s.has_audio ? (
            <audio ref={audio} src={`/api/sessions/${sessionId}/audio`} controls onTimeUpdate={onTime} style={{ width: "100%" }} className="no-print" />
          ) : null}
        </div>

        <div className="stack">
          {sel && (
            <div className="card">
              <div className="spread">
                <h3>“{clean(sel.text)}”</h3>
                {!!s.has_audio && sel.start != null && (
                  <button className="btn small" onClick={() => play(sel.i)}>
                    ▶ Play
                  </button>
                )}
              </div>
              <p style={{ margin: "8px 0" }}>{STATUS_TEXT[sel.status]}</p>
              {sel.heard && sel.status !== "correct" && <p className="small muted">Heard: “{sel.heard}” (confidence {sel.confidence})</p>}
              {sel.hesitation_ms > 0 && <p className="small muted">Paused {(sel.hesitation_ms / 1000).toFixed(1)}s before this word</p>}
              {sel.teacher && <p className="small" style={{ color: "var(--sky)" }}>✎ You changed this from “{sel.model}”.</p>}
              {sel.status !== "not_reached" && sel.status !== "told" && (
                <div className="row no-print" style={{ marginTop: 10 }}>
                  <button className="btn small go" onClick={() => decide(sel.i, "correct")}>
                    ✓ Mark correct
                  </button>
                  <button className="btn small stop" onClick={() => decide(sel.i, "error")}>
                    ✗ Mark error
                  </button>
                  {sel.teacher && (
                    <button className="btn small ghost" onClick={() => decide(sel.i, null)}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {checks.length > 0 && (
            <div className="card flat">
              <h3>Needs your check ({checks.filter((w) => !w.teacher).length})</h3>
              <p className="small muted" style={{ marginTop: 4 }}>
                ReadAlong never marks a child wrong unless it's sure. These are yours to decide.
              </p>
              <div className="check-list">
                {checks.map((w) => (
                  <div key={w.i} className="check-item">
                    <button className="btn small ghost" onClick={() => play(w.i)} style={{ boxShadow: "none" }}>
                      ▶ “{clean(w.text)}” {w.heard ? `→ heard “${w.heard}”` : "(not heard)"}
                    </button>
                    {w.teacher ? (
                      <span className="small">{w.status === "correct" ? "✓ correct" : "✗ error"}</span>
                    ) : (
                      <span className="row no-print" style={{ gap: 6 }}>
                        <button className="btn small go" onClick={() => decide(w.i, "correct")} aria-label="Correct">
                          ✓
                        </button>
                        <button className="btn small stop" onClick={() => decide(w.i, "error")} aria-label="Error">
                          ✗
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.feedback && (
            <div className="card flat">
              <h3>Running-record note</h3>
              <p>{s.feedback.teacher_note}</p>
              <p className="small">
                <b>Focus next:</b> {s.feedback.focus_skill}
              </p>
            </div>
          )}

          <div className="card flat">
            <h3>Understanding</h3>
            {s.comprehension ? (
              <>
                <p>
                  Retell: <b>{s.comprehension.retell}</b> · Questions: <b>{s.comprehension.questions_correct}/{s.comprehension.questions_total}</b>
                </p>
                {s.comprehension.notes && <p className="small muted">{s.comprehension.notes}</p>}
                {s.comprehension.transcript?.length > 0 && (
                  <details>
                    <summary className="small">Conversation with Pip</summary>
                    <div className="timeline" style={{ marginTop: 8 }}>
                      {s.comprehension.transcript.map((l, i) => (
                        <div key={i}>
                          <span className="t">{l.who === "pip" ? "Pip" : s.student.name}</span>
                          <span>{l.text}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <p className="muted small">No comprehension chat for this reading.</p>
            )}
          </div>

          {s.events.length > 0 && (
            <div className="card flat">
              <h3 style={{ marginBottom: 8 }}>Reading behaviours</h3>
              <div className="timeline">
                {s.events.map((e, i) => (
                  <div key={i}>
                    <span className="t">{(e.start / 1000).toFixed(1)}s</span>
                    <span>{EVENT_TEXT[e.type]?.(e) ?? e.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

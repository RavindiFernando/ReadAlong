import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TrendChart } from "../components/Charts";
import { STATUS_LABEL, statusOf } from "./Teacher";

function Insight({ student, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const insight = student.insight;
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.insight(student.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card insight">
      <div className="spread">
        <h3>✨ Coaching insight</h3>
        <button className="btn small no-print" onClick={generate} disabled={busy || !student.sessions.length}>
          {busy ? "Analyzing…" : insight ? "Refresh" : "Analyze readings"}
        </button>
      </div>
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
      {!insight && !busy && (
        <p className="muted">Looks across every reading for patterns in the words {student.name} misses, and suggests next steps.</p>
      )}
      {insight && (
        <>
          <p>{insight.summary}</p>
          {insight.patterns?.length > 0 && (
            <>
              <b className="small">Patterns</b>
              <ul>
                {insight.patterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <b className="small">Try next</b>
          <ul>
            {insight.next_steps.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <p className="small faint" style={{ marginBottom: 0 }}>
            {insight.source === "llm" ? "Written by AssemblyAI LLM Gateway, checked against the actual missed words." : "Summary from reading data."}
          </p>
        </>
      )}
    </div>
  );
}

export default function StudentDetail({ studentId }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.student(studentId).then(setS).catch((e) => setError(e.message));
  }, [studentId]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!s) return <div className="spinner" />;

  const latest = s.sessions.at(-1);
  const st = statusOf({ ...s, latest });
  const first = s.sessions[0]?.report;
  const r = latest?.report;

  return (
    <>
      <a className="back no-print" href="#/teacher">
        ← All readers
      </a>
      <div className="spread" style={{ marginBottom: 22 }}>
        <div className="row">
          <div className="avatar lg" style={{ background: s.color }}>
            {s.avatar}
          </div>
          <div>
            <h1>{s.name}</h1>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              <span className="muted">Grade {s.grade}</span>
              <span className={`chip ${st}`}>{STATUS_LABEL[st]}</span>
            </div>
          </div>
        </div>
        <div className="row no-print">
          <a className="btn" href={`#/read/${s.id}`}>
            🎤 New reading
          </a>
          <button className="btn ghost" onClick={() => print()}>
            🖨 Print
          </button>
        </div>
      </div>

      {r && (
        <div className="stat-row" style={{ marginBottom: 20 }}>
          <div className="stat">
            <div className="v">{r.wcpm}</div>
            <div className="k">latest WCPM (benchmark {s.benchmark ?? "n/a"})</div>
          </div>
          <div className="stat">
            <div className="v">{first ? (r.wcpm - first.wcpm >= 0 ? "+" : "") + (r.wcpm - first.wcpm) : "—"}</div>
            <div className="k">WCPM growth since first reading</div>
          </div>
          <div className="stat">
            <div className="v">{r.accuracy}%</div>
            <div className="k">accuracy · {r.level} level</div>
          </div>
          <div className="stat">
            <div className="v">{s.sessions.length}</div>
            <div className="k">readings</div>
          </div>
        </div>
      )}

      <div className="two-col" style={{ marginBottom: 20 }}>
        <div className="card flat">
          <h3 style={{ marginBottom: 8 }}>Words correct per minute</h3>
          <TrendChart sessions={s.sessions} target={s.benchmark} />
          <p className="small faint" style={{ margin: 0 }}>
            - - - grade benchmark ({s.benchmark ?? "n/a"}) · ● yellow = live reading with audio · ○ white = demo history
          </p>
        </div>
        <div className="stack">
          <Insight student={s} onUpdate={(insight) => setS({ ...s, insight })} />
          <div className="card flat">
            <h3 style={{ marginBottom: 10 }}>Word bank: most missed</h3>
            {s.word_bank.length ? (
              <div className="word-bank">
                {s.word_bank.map(([w, n]) => (
                  <span key={w}>
                    {w}
                    {n > 1 && <b>×{n}</b>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No missed words yet.</p>
            )}
          </div>
        </div>
      </div>

      <h2 style={{ marginBottom: 12 }}>Readings</h2>
      <div className="session-list">
        {[...s.sessions].reverse().map((x) => (
          <a key={x.id} className="session-item" href={`#/session/${x.id}`}>
            <span style={{ fontSize: "1.6rem" }} aria-hidden>
              {x.emoji}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{x.title}</div>
              <div className="small muted">
                {new Date(x.created_at * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {x.feedback?.focus_skill && ` · focus: ${x.feedback.focus_skill}`}
                {x.comprehension && ` · understanding ${x.comprehension.questions_correct}/2`}
              </div>
            </div>
            <div className="small" style={{ textAlign: "right" }}>
              <b>{x.report.wcpm}</b> WCPM
              <br />
              {x.report.accuracy}%
            </div>
            <div className="row" style={{ gap: 6 }}>
              {x.report.checks > 0 && <span className="chip" style={{ color: "var(--plum)" }}>{x.report.checks} to check</span>}
              {x.demo ? <span className="chip demo">demo</span> : <span className="chip live">🎧 audio</span>}
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

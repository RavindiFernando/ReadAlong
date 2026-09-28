import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Bullet, Sparkline } from "../components/Charts";

export const STATUS_LABEL = { on_track: "On track", monitor: "Monitor", support: "Needs support", unknown: "No data" };

export function statusOf(student) {
  const r = student.latest?.report;
  if (!r || !student.benchmark) return "unknown";
  if (r.wcpm >= student.benchmark) return "on_track";
  if (r.wcpm >= 0.8 * student.benchmark) return "monitor";
  return "support";
}

function ago(ts) {
  const d = Math.round((Date.now() / 1000 - ts) / 86400);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export default function Teacher() {
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.students().then(setStudents).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!students) return <div className="spinner" />;

  const withData = students.filter((s) => s.latest);
  const statuses = students.map(statusOf);
  const count = (k) => statuses.filter((s) => s === k).length;
  const growth = withData.filter((s) => s.trend.length > 1);
  const avgGrowth = growth.length
    ? Math.round(growth.reduce((a, s) => a + (s.trend.at(-1).wcpm - s.trend[0].wcpm), 0) / growth.length)
    : 0;
  const readings = students.reduce((a, s) => a + s.sessions, 0);
  const priority = [...students].sort(
    (a, b) => ["support", "monitor", "on_track", "unknown"].indexOf(statusOf(a)) - ["support", "monitor", "on_track", "unknown"].indexOf(statusOf(b)),
  );

  return (
    <>
      <div className="teacher-head">
        <div>
          <p className="muted small" style={{ margin: 0 }}>
            Oral reading fluency · {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
          <h1>Your readers</h1>
        </div>
        <button className="btn no-print" onClick={() => print()}>
          🖨 Print progress report
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v">{readings}</div>
          <div className="k">readings assessed, zero minutes of your time</div>
        </div>
        <div className="kpi">
          <div className="v" style={{ color: "var(--leaf)" }}>
            {count("on_track")}/{students.length}
          </div>
          <div className="k">at or above grade benchmark</div>
        </div>
        <div className="kpi">
          <div className="v" style={{ color: "var(--coral)" }}>
            {count("support")}
          </div>
          <div className="k">need support now</div>
        </div>
        <div className="kpi">
          <div className="v">{avgGrowth >= 0 ? `+${avgGrowth}` : avgGrowth}</div>
          <div className="k">average WCPM growth</div>
        </div>
      </div>

      <div className="card flat table-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th>Student</th>
              <th>Latest WCPM vs benchmark</th>
              <th>Accuracy</th>
              <th>Trend</th>
              <th>Understanding</th>
              <th>Status</th>
              <th>Last read</th>
            </tr>
          </thead>
          <tbody>
            {priority.map((s) => {
              const r = s.latest?.report;
              const c = s.latest?.comprehension;
              const st = statusOf(s);
              return (
                <tr key={s.id} className="click" onClick={() => (location.hash = `#/teacher/${s.id}`)}>
                  <td>
                    <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <div className="avatar sm" style={{ background: s.color }}>
                        {s.avatar}
                      </div>
                      <div>
                        <a href={`#/teacher/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                          {s.name}
                        </a>
                        <div className="small faint">Grade {s.grade}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r ? (
                      <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                        <b style={{ minWidth: 30 }}>{r.wcpm}</b>
                        <Bullet value={r.wcpm} target={s.benchmark} />
                      </div>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>{r ? `${r.accuracy}%` : "—"}</td>
                  <td>
                    <Sparkline values={s.trend.map((t) => t.wcpm)} target={s.benchmark} />
                  </td>
                  <td className="small">{c ? `${c.questions_correct}/${c.questions_total} · ${c.retell} retell` : <span className="faint">—</span>}</td>
                  <td>
                    <span className={`chip ${st}`}>{STATUS_LABEL[st]}</span>
                  </td>
                  <td className="small muted">{s.latest ? ago(s.latest.created_at) : "never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small faint" style={{ marginTop: 14 }}>
        Benchmarks: 50th percentile oral reading fluency norms for the current season (Hasbrouck &amp; Tindal, 2017). A
        screening signal, not a diagnosis. Students are listed by who needs attention first.
      </p>
    </>
  );
}

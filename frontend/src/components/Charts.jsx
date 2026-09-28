// Small hand-rolled SVG charts: a roster sparkline and a WCPM trend with
// the grade benchmark as a reference line.

export function Sparkline({ values, target, width = 110, height = 34 }) {
  if (!values.length) return <span className="faint small">—</span>;
  const all = target ? [...values, target] : values;
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.05;
  const x = (i) => (values.length === 1 ? width / 2 : 4 + (i * (width - 8)) / (values.length - 1));
  const y = (v) => height - 4 - ((v - lo) / (hi - lo || 1)) * (height - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} aria-label={`WCPM trend ${values.join(", ")}`}>
      {target && <line x1="0" x2={width} y1={y(target)} y2={y(target)} stroke="#9a9cad" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke={up ? "#2f9e6b" : "#e4572e"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill={up ? "#2f9e6b" : "#e4572e"} />
    </svg>
  );
}

export function TrendChart({ sessions, target, height = 240 }) {
  const width = 640;
  const pad = { l: 40, r: 30, t: 24, b: 30 };
  const vals = sessions.map((s) => s.report.wcpm);
  if (!vals.length) return <p className="muted">No readings yet.</p>;
  const hi = Math.max(...vals, target || 0) * 1.15;
  const x = (i) => pad.l + (vals.length === 1 ? (width - pad.l - pad.r) / 2 : (i * (width - pad.l - pad.r)) / (vals.length - 1));
  const y = (v) => pad.t + (1 - v / hi) * (height - pad.t - pad.b);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(vals.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(hi * f));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Words correct per minute over time">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#e6dac2" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#9a9cad">{t}</text>
        </g>
      ))}
      {target && (
        <g>
          <line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} stroke="#1f2440" strokeWidth="2" strokeDasharray="6 5" />
        </g>
      )}
      <path d={area} fill="#d3efdd" opacity="0.7" />
      <path d={line} fill="none" stroke="#2f9e6b" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={sessions[i].demo ? 5 : 7} fill={sessions[i].demo ? "#fff" : "#f2b33d"} stroke="#1f2440" strokeWidth="2.5">
            <title>{`${new Date(sessions[i].created_at * 1000).toLocaleDateString()}: ${v} WCPM`}</title>
          </circle>
          <text x={x(i)} y={height - 10} textAnchor="middle" fontSize="11" fill="#9a9cad">
            {new Date(sessions[i].created_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Bullet({ value, target, max }) {
  const top = Math.max(max || 0, value, target || 0) * 1.1 || 1;
  const color = !target ? "#9a9cad" : value >= target ? "#2f9e6b" : value >= 0.8 * target ? "#f2b33d" : "#e4572e";
  return (
    <div className="bullet" title={`${value} WCPM vs benchmark ${target ?? "n/a"}`}>
      <div className="fill" style={{ width: `${(value / top) * 100}%`, background: color }} />
      {target && <div className="target" style={{ left: `${(target / top) * 100}%` }} />}
    </div>
  );
}

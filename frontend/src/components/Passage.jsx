// Renders passage words with their reading status. `onWord` makes them clickable.
export default function Passage({ tokens, words, cursor = -1, rescue = -1, playing = -1, onWord }) {
  return (
    <p className="passage">
      {tokens.map((t, i) => {
        const w = words?.[i];
        const cls = [
          "w",
          w?.status || "pending",
          i === cursor ? "cursor" : "",
          i === rescue ? "rescue" : "",
          i === playing ? "playing" : "",
          w?.teacher ? "teacher" : "",
        ].join(" ");
        const title = w?.heard && w.status !== "correct" ? `heard “${w.heard}”` : undefined;
        return (
          <span key={i}>
            {onWord ? (
              <button className={cls} onClick={() => onWord(i)} title={title}>
                {t}
              </button>
            ) : (
              <span className={cls} title={title}>
                {t}
              </span>
            )}{" "}
          </span>
        );
      })}
    </p>
  );
}

export function Legend({ teacher }) {
  const items = [
    ["var(--leaf-soft)", "read right"],
    ["var(--coral-soft)", "misread"],
    ["transparent", "skipped", "line-through"],
    ["var(--sky-soft)", "Pip helped"],
  ];
  if (teacher) items.push(["var(--plum-soft)", "needs your check"]);
  return (
    <div className="legend">
      {items.map(([bg, label, deco]) => (
        <span key={label}>
          <i style={{ background: bg, border: deco ? "1.5px dashed var(--coral)" : "1.5px solid var(--line)" }} />
          {label}
        </span>
      ))}
    </div>
  );
}

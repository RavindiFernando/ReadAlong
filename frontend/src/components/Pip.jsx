// Pip, the ReadAlong owl. `mood`: idle | listening | happy | talking | thinking
export default function Pip({ mood = "idle", size = 180, level = 0 }) {
  const scale = 1 + Math.min(level, 1) * 0.06;
  return (
    <svg
      className={`pip ${mood}`}
      width={size}
      height={size * 1.1}
      viewBox="0 0 200 220"
      role="img"
      aria-label={`Pip the owl, ${mood}`}
    >
      <g className="rings">
        <circle cx="100" cy="120" r="70" />
        <circle cx="100" cy="120" r="70" />
      </g>
      <g className="body-group" style={{ transform: `scale(${scale})`, transformOrigin: "100px 200px", transition: "transform 0.1s" }}>
        <g className="tufts">
          <path d="M52 62 L58 22 L84 52 Z" fill="#6b4a2e" stroke="#1f2440" strokeWidth="4" strokeLinejoin="round" />
          <path d="M148 62 L142 22 L116 52 Z" fill="#6b4a2e" stroke="#1f2440" strokeWidth="4" strokeLinejoin="round" />
        </g>
        <ellipse cx="100" cy="122" rx="72" ry="80" fill="#8b5e3c" stroke="#1f2440" strokeWidth="4" />
        <path d="M34 120 Q20 160 52 186 Q48 150 60 128 Z" fill="#6b4a2e" stroke="#1f2440" strokeWidth="4" strokeLinejoin="round" />
        <path d="M166 120 Q180 160 148 186 Q152 150 140 128 Z" fill="#6b4a2e" stroke="#1f2440" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="100" cy="150" rx="44" ry="46" fill="#f6e3c4" stroke="#1f2440" strokeWidth="3" />
        <path d="M80 140 q6 6 12 0 M108 140 q6 6 12 0 M92 160 q6 6 12 0 M78 172 q6 6 12 0 M110 172 q6 6 12 0"
          fill="none" stroke="#c9a57a" strokeWidth="3" strokeLinecap="round" />
        {mood === "happy" ? (
          <g fill="none" stroke="#1f2440" strokeWidth="6" strokeLinecap="round">
            <path d="M58 86 q14 -16 28 0" />
            <path d="M114 86 q14 -16 28 0" />
          </g>
        ) : (
          <g>
            <circle cx="72" cy="86" r="24" fill="#fff8ec" stroke="#1f2440" strokeWidth="4" />
            <circle cx="128" cy="86" r="24" fill="#fff8ec" stroke="#1f2440" strokeWidth="4" />
            <g className="pupils">
              <circle cx="74" cy="88" r="11" fill="#1f2440" />
              <circle cx="126" cy="88" r="11" fill="#1f2440" />
              <circle cx="78" cy="83" r="4" fill="#fff" />
              <circle cx="130" cy="83" r="4" fill="#fff" />
            </g>
            <ellipse className="eyelid" cx="72" cy="86" rx="25" ry="25" fill="#8b5e3c" />
            <ellipse className="eyelid" cx="128" cy="86" rx="25" ry="25" fill="#8b5e3c" />
          </g>
        )}
        <path d="M88 100 L112 100 L100 112 Z" fill="#f2b33d" stroke="#1f2440" strokeWidth="3.5" strokeLinejoin="round" />
        <path className="beak-low" d="M92 106 L108 106 L100 116 Z" fill="#e39a1f" stroke="#1f2440" strokeWidth="3" strokeLinejoin="round" />
        <g fill="#f2b33d" stroke="#1f2440" strokeWidth="3">
          <ellipse cx="80" cy="200" rx="14" ry="7" />
          <ellipse cx="120" cy="200" rx="14" ry="7" />
        </g>
        {mood === "happy" && (
          <g fill="#f7a8a0" opacity="0.8">
            <ellipse cx="54" cy="108" rx="10" ry="6" />
            <ellipse cx="146" cy="108" rx="10" ry="6" />
          </g>
        )}
      </g>
    </svg>
  );
}

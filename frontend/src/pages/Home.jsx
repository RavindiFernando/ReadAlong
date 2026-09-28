import { useEffect, useState } from "react";
import Pip from "../components/Pip";
import { api } from "../lib/api";

const AVATARS = ["🦊", "🐯", "🐼", "🐸", "🦄", "🐙", "🐨", "🦁", "🐰", "🐧", "🦖", "🐝"];
const COLORS = ["#F4A259", "#E9C46A", "#8AB17D", "#2A9D8F", "#B392AC", "#5E8BC4", "#E07A5F", "#98C1D9"];

function NewReader({ onDone }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(2);
  const [avatar, setAvatar] = useState("🐨");
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const s = await api.createStudent({ name, grade: Number(grade), avatar, color });
      onDone(s);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="card form-grid" onSubmit={save}>
      <h3>New reader</h3>
      {error && <div className="error-banner">{error}</div>}
      <input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} />
      <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
        {[1, 2, 3, 4, 5].map((g) => (
          <option key={g} value={g}>
            Grade {g}
          </option>
        ))}
      </select>
      <div className="avatar-pick">
        {AVATARS.map((a) => (
          <button type="button" key={a} className={a === avatar ? "on" : ""} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>
            {a}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" type="submit">
          Add reader
        </button>
        <button className="btn ghost" type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Home() {
  const [students, setStudents] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const load = () => api.students().then(setStudents).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <section className="hero">
        <Pip mood="happy" size={170} />
        <div className="stack">
          <h1>Who's reading with Pip today?</h1>
          <p className="muted">
            Read a story out loud. Pip listens to every word, helps when you get stuck, and cheers you on.
          </p>
        </div>
      </section>
      {error && <div className="error-banner">Can't reach the ReadAlong server: {error}</div>}
      {!students && !error && <div className="spinner" />}
      {students && (
        <div className="grid readers">
          {students.map((s) => (
            <a key={s.id} className="card reader-card" href={`#/read/${s.id}`}>
              <div className="avatar" style={{ background: s.color }}>
                {s.avatar}
              </div>
              <div className="name">{s.name}</div>
              <div className="small muted">
                Grade {s.grade} · {s.sessions} {s.sessions === 1 ? "story" : "stories"}
              </div>
            </a>
          ))}
          {!adding && (
            <button className="card reader-card add-card" onClick={() => setAdding(true)}>
              <div className="avatar" style={{ background: "transparent", borderStyle: "dashed" }}>
                +
              </div>
              <div className="name">New reader</div>
            </button>
          )}
        </div>
      )}
      {adding && (
        <div style={{ maxWidth: 460, marginTop: 20 }}>
          <NewReader
            onDone={(s) => {
              setAdding(false);
              if (s) location.hash = `#/read/${s.id}`;
              else load();
            }}
          />
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/api";

function Level({ grade }) {
  return (
    <span className="level-dots" aria-label={`Grade ${grade} level`}>
      {[1, 2, 3, 4].map((g) => (
        <i key={g} className={g <= grade ? "on" : ""} />
      ))}
    </span>
  );
}

export default function Library({ studentId }) {
  const [student, setStudent] = useState(null);
  const [passages, setPassages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.student(studentId), api.passages()])
      .then(([s, p]) => {
        setStudent(s);
        // Stories at the child's level first, then one above and below.
        setPassages([...p].sort((a, b) => Math.abs(a.grade - s.grade) - Math.abs(b.grade - s.grade) || a.grade - b.grade));
      })
      .catch((e) => setError(e.message));
  }, [studentId]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!student) return <div className="spinner" />;
  const read = new Set(student.sessions.map((s) => s.passage_id));

  return (
    <>
      <a className="back" href="#/">
        ← Switch reader
      </a>
      <div className="spread" style={{ marginBottom: 24 }}>
        <div className="row">
          <div className="avatar lg" style={{ background: student.color }}>
            {student.avatar}
          </div>
          <div>
            <h1>Hi {student.name}!</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Pick a story to read out loud.
            </p>
          </div>
        </div>
      </div>
      <div className="grid books">
        {passages.map((p) => (
          <a key={p.id} className="book" href={`#/read/${studentId}/${p.id}`}>
            <div className="book-cover" style={{ background: p.color }}>
              <span aria-hidden>{p.emoji}</span>
            </div>
            <div className="book-body">
              <div className="book-title">{p.title}</div>
              <div className="spread small muted">
                <span>
                  <Level grade={p.grade} /> &nbsp;Grade {p.grade}
                </span>
                <span>{p.words} words</span>
              </div>
              {read.has(p.id) && <span className="chip on_track" style={{ justifySelf: "start" }}>★ read before</span>}
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

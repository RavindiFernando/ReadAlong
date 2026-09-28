import { useEffect, useRef, useState } from "react";
import Pip from "../components/Pip";
import Passage from "../components/Passage";
import Results from "./Results";
import { api, wsUrl } from "../lib/api";
import { startMic } from "../lib/mic";
import { say, sayWord } from "../lib/speak";

const STUCK_MS = 4500; // silence on the same word before Pip helps

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Reader({ studentId, passageId }) {
  const [student, setStudent] = useState(null);
  const [passage, setPassage] = useState(null);
  const [phase, setPhase] = useState("intro"); // intro | connecting | reading | checking | results
  const [tokens, setTokens] = useState([]);
  const [words, setWords] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [partial, setPartial] = useState("");
  const [rescue, setRescue] = useState(-1);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bubble, setBubble] = useState("");
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);

  const ws = useRef(null);
  const stopMic = useRef(null);
  const live = useRef({ cursor: 0, lastAdvance: 0, told: new Set(), startedAt: 0, finishing: false, phase: "intro" });

  useEffect(() => {
    Promise.all([api.student(studentId), api.passages()])
      .then(([s, ps]) => {
        const p = ps.find((x) => x.id === passageId);
        setStudent(s);
        setPassage(p);
        setTokens(p.text.split(/\s+/));
        setBubble(`Hi ${s.name}! Press Start, then read the story out loud. I'll follow along.`);
      })
      .catch((e) => setError(e.message));
    return () => {
      stopMic.current?.();
      ws.current?.close();
    };
  }, [studentId, passageId]);

  const go = (p) => {
    live.current.phase = p;
    setPhase(p);
  };

  const finish = () => {
    if (live.current.finishing) return;
    live.current.finishing = true;
    stopMic.current?.();
    stopMic.current = null;
    setLevel(0);
    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify({ type: "stop" }));
    setBubble("Let me look at how you did…");
    go("checking");
  };

  const start = () => {
    setError(null);
    go("connecting");
    setBubble("Getting my ears ready…");
    Object.assign(live.current, { cursor: 0, told: new Set(), finishing: false });
    const sock = new WebSocket(wsUrl("/ws/read"));
    sock.binaryType = "arraybuffer";
    ws.current = sock;
    sock.onopen = () => sock.send(JSON.stringify({ type: "start", mode: "read", student_id: studentId, passage_id: passageId }));
    sock.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "ready") {
        setTokens(msg.tokens);
        try {
          stopMic.current = await startMic({
            rate: 16000,
            onChunk: (pcm) => sock.readyState === WebSocket.OPEN && sock.send(pcm),
            onLevel: setLevel,
          });
        } catch {
          setError("Pip needs your microphone. Please allow mic access and try again.");
          sock.close();
          go("intro");
          return;
        }
        live.current.startedAt = live.current.lastAdvance = performance.now();
        setBubble("I'm listening. Start with the title or the first word!");
        go("reading");
      } else if (msg.type === "progress") {
        const told = live.current.told;
        setWords(msg.words.map((w) => (told.has(w.i) && w.status !== "correct" ? { ...w, status: "told" } : w)));
        setPartial(msg.partial);
        if (msg.cursor > live.current.cursor) {
          live.current.cursor = msg.cursor;
          live.current.lastAdvance = performance.now();
          setCursor(msg.cursor);
          setRescue(-1);
          const half = Math.floor(msg.words.length / 2);
          if (msg.cursor >= half && msg.cursor - 3 < half) setBubble("You're halfway there. Great reading!");
          if (msg.cursor >= msg.words.length) setTimeout(finish, 1200);
        }
      } else if (msg.type === "report") {
        setResult(msg);
        setWords(msg.words);
        go("results");
      } else if (msg.type === "feedback") {
        setFeedback(msg.feedback);
        say(msg.feedback.kid_message);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };
    sock.onclose = () => {
      if (live.current.phase === "connecting" || live.current.phase === "reading") {
        stopMic.current?.();
        setError("Lost connection to Pip. Check the server and try again.");
        go("intro");
      }
    };
  };

  // Timer + stuck-word rescue.
  useEffect(() => {
    if (phase !== "reading") return;
    const id = setInterval(() => {
      const L = live.current;
      const now = performance.now();
      setElapsed(now - L.startedAt);
      const i = L.cursor;
      if (i > 0 && i < tokens.length && now - L.lastAdvance > STUCK_MS && !L.told.has(i)) {
        L.told.add(i);
        L.lastAdvance = now;
        ws.current?.send(JSON.stringify({ type: "told", index: i }));
        setRescue(i);
        setWords((ws_) => ws_.map((w) => (w.i === i ? { ...w, status: "told" } : w)));
        const clean = tokens[i].replace(/[^\p{L}'’-]/gu, "");
        setBubble(`That word is “${clean}”. Say it with me, then keep going!`);
        sayWord(tokens[i]);
      } else if (i === 0 && now - L.startedAt > 9000 && now - L.lastAdvance > 9000) {
        L.lastAdvance = now;
        setBubble(`Take your time. Start with “${tokens[0]}”.`);
      }
    }, 400);
    return () => clearInterval(id);
  }, [phase, tokens]);

  if (error && !passage) return <div className="error-banner">{error}</div>;
  if (!passage || !student) return <div className="spinner" />;

  if (phase === "results" && result) {
    return (
      <Results
        student={student}
        passage={passage}
        tokens={tokens}
        result={result}
        feedback={feedback}
        onAgain={() => location.reload()}
      />
    );
  }

  const mood = phase === "reading" ? (rescue >= 0 ? "talking" : "listening") : phase === "checking" ? "thinking" : "idle";

  return (
    <>
      <a className="back" href={`#/read/${studentId}`}>
        ← Back to stories
      </a>
      {error && <div className="error-banner">{error}</div>}
      <div className="reader-layout">
        <aside className="pip-dock">
          <div className="speech" aria-live="polite">
            {bubble}
          </div>
          <Pip mood={mood} size={190} level={phase === "reading" ? level : 0} />
        </aside>
        <section>
          <article className="page">
            <div className="page-title">
              <span style={{ fontSize: "2.2rem" }} aria-hidden>
                {passage.emoji}
              </span>
              <h2>{passage.title}</h2>
            </div>
            <Passage tokens={tokens} words={words} cursor={phase === "reading" ? cursor : -1} rescue={rescue} />
            {phase === "reading" && <div className="hearing">{partial ? `Pip hears: “${partial}”` : " "}</div>}
          </article>
          <div className="reader-controls">
            {phase === "intro" && (
              <button className="btn go big" onClick={start}>
                🎤 Start reading
              </button>
            )}
            {phase === "connecting" && (
              <button className="btn big" disabled>
                <span className="spinner" /> Connecting…
              </button>
            )}
            {phase === "reading" && (
              <button className="btn stop big" onClick={finish}>
                ✋ I'm done
              </button>
            )}
            {phase === "checking" && (
              <button className="btn big" disabled>
                <span className="spinner" /> Checking…
              </button>
            )}
            <div className="progress-rail" aria-label="Reading progress">
              <div style={{ width: `${(cursor / Math.max(tokens.length, 1)) * 100}%` }} />
            </div>
            <div className="timer" aria-label="Time">
              {clock(elapsed)}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

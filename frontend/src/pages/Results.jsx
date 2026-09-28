import { useEffect, useRef, useState } from "react";
import Pip from "../components/Pip";
import Confetti from "../components/Confetti";
import Passage, { Legend } from "../components/Passage";
import { api, wsUrl } from "../lib/api";
import { startMic } from "../lib/mic";
import { say, sayWord } from "../lib/speak";
import { startPipCall } from "../lib/voiceAgent";

function PracticeCard({ word }) {
  const [state, setState] = useState("idle"); // idle | listening | won | retry
  const [heard, setHeard] = useState("");
  const stop = useRef(null);

  const listen = () => {
    setState("listening");
    const sock = new WebSocket(wsUrl("/ws/read"));
    sock.binaryType = "arraybuffer";
    let timer;
    const done = () => {
      clearTimeout(timer);
      stop.current?.();
      stop.current = null;
      sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify({ type: "stop" }));
    };
    sock.onopen = () => sock.send(JSON.stringify({ type: "start", mode: "practice", word }));
    sock.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "ready") {
        stop.current = await startMic({ rate: 16000, onChunk: (pcm) => sock.readyState === 1 && sock.send(pcm) });
        timer = setTimeout(done, 3500);
      } else if (msg.type === "progress" && msg.words[0]?.status === "correct") {
        setTimeout(done, 300);
      } else if (msg.type === "practice_result") {
        setHeard(msg.heard);
        setState(msg.correct ? "won" : "retry");
        say(msg.correct ? "Yes! You got it!" : "Almost. Listen, and try again.");
      } else if (msg.type === "error") {
        done();
        setState("idle");
      }
    };
  };

  return (
    <div className={`card practice-card ${state === "won" ? "won" : ""}`}>
      <div className="practice-word">{word}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn small" onClick={() => sayWord(word)} aria-label={`Hear ${word}`}>
          🔊 Hear it
        </button>
        <button className="btn small primary" onClick={listen} disabled={state === "listening"}>
          {state === "listening" ? "Listening…" : "🎤 Say it"}
        </button>
      </div>
      <div className="small" style={{ minHeight: "1.3em" }}>
        {state === "won" && "⭐ You got it!"}
        {state === "retry" && `Pip heard “${heard || "…"}”. Try again!`}
      </div>
    </div>
  );
}

function TalkWithPip({ student, passage, sessionId, onClose, onSaved }) {
  const [status, setStatus] = useState("connecting");
  const [talking, setTalking] = useState(false);
  const [lines, setLines] = useState([]);
  const [liveKid, setLiveKid] = useState("");
  const [liveAgent, setLiveAgent] = useState("");
  const [error, setError] = useState(null);
  const call = useRef(null);
  const recorded = useRef(false);
  const transcript = useRef([]);
  const scroller = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const [q1, q2] = passage.questions;
    const session = {
      system_prompt: [
        `You are Pip, a gentle, cheerful owl and reading buddy for ${student.name}, a grade ${student.grade} child.`,
        `${student.name} just read this story out loud:\n"""${passage.text}"""`,
        "Have a short, friendly chat to check they understood it.",
        "1. The greeting already asked what happened in the story. Listen to their retell and respond warmly in one sentence.",
        `2. Then ask these questions, one at a time: "${q1}" then "${q2}". If an answer is off or they don't know, give one gentle hint from the story, then move on. Never say "wrong".`,
        "3. After both questions, call record_comprehension exactly once.",
        "4. Then say one short cheerful goodbye that mentions something they said.",
        "Rules: very short, simple sentences a young child understands, at most 15 words per turn. One question at a time. Children pause to think, so be patient. Never mention scores, tests or grades. If they go off topic, gently steer back to the story.",
      ].join("\n\n"),
      greeting: `Hoo hoo! Hi ${student.name}, it's Pip. Can you tell me what happened in the story?`,
      output: { voice: "alba" },
      input: { turn_detection: { min_silence: 1200, max_silence: 4000 } },
      tools: [
        {
          type: "function",
          name: "record_comprehension",
          description:
            "Save how well the child understood the story. Call exactly once, after the retell and both questions.",
          parameters: {
            type: "object",
            properties: {
              retell: {
                type: "string",
                enum: ["complete", "partial", "minimal"],
                description: "complete = beginning, middle and end in order; partial = some key events; minimal = little or none",
              },
              questions_correct: { type: "integer", description: "How many of the 2 questions were answered correctly (0, 1 or 2)" },
              notes: { type: "string", description: "One short sentence for the teacher or parent about their understanding" },
            },
            required: ["retell", "questions_correct"],
          },
        },
      ],
    };

    startPipCall({
      session,
      onToolCall: async (name, args) => {
        if (name !== "record_comprehension") return { error: "unknown tool" };
        const c = {
          retell: args.retell,
          questions_correct: Math.max(0, Math.min(2, Number(args.questions_correct) || 0)),
          questions_total: 2,
          notes: args.notes || "",
          transcript: transcript.current,
        };
        await api.saveComprehension(sessionId, c);
        recorded.current = true;
        onSaved(c);
        return { saved: true };
      },
      on: {
        status: setStatus,
        talking: (t) => {
          setTalking(t);
          if (!t && recorded.current && transcript.current.at(-1)?.who === "pip") {
            setTimeout(() => call.current?.end(), 900);
          }
        },
        caption: (text, final) => {
          if (final) {
            transcript.current.push({ who: "pip", text });
            setLines((l) => [...l, { who: "pip", text }]);
            setLiveAgent("");
          } else setLiveAgent((a) => (a + " " + text).trim());
        },
        userCaption: (text, final) => {
          if (final) {
            transcript.current.push({ who: "kid", text });
            setLines((l) => [...l, { who: "kid", text }]);
            setLiveKid("");
          } else setLiveKid(text);
        },
        error: setError,
        ended: () => setStatus("ended"),
      },
    })
      .then((c) => {
        if (cancelled) c.end();
        else call.current = c;
      })
      .catch((e) => setError(e.message || "Could not start the call."));
    return () => {
      cancelled = true;
      call.current?.end();
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [lines, liveKid, liveAgent]);

  const mood = status === "ended" ? "happy" : talking ? "talking" : status === "connecting" ? "thinking" : "listening";

  return (
    <div className="overlay" role="dialog" aria-label="Talk with Pip">
      <div className="call">
        <Pip mood={mood} size={170} />
        <h2>{status === "ended" ? "Thanks for chatting!" : "Talk with Pip"}</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="captions" ref={scroller}>
          {lines.map((l, i) => (
            <div key={i} className={`bubble ${l.who}`}>
              {l.text}
            </div>
          ))}
          {liveAgent && <div className="bubble pip live">{liveAgent}</div>}
          {liveKid && <div className="bubble kid live">{liveKid}</div>}
        </div>
        <div className="small muted">
          {status === "connecting" && "Calling Pip…"}
          {status === "listening" && !talking && "Pip is listening. Just talk!"}
          {status === "hearing" && "Pip hears you…"}
          {talking && "Pip is talking…"}
        </div>
        <button
          className={`btn ${status === "ended" ? "primary" : "stop"}`}
          onClick={() => (status === "ended" ? onClose() : call.current ? call.current.end() : onClose())}
        >
          {status === "ended" ? "Done" : "Hang up"}
        </button>
      </div>
    </div>
  );
}

export default function Results({ student, passage, tokens, result, feedback, onAgain }) {
  const { report, words, session_id: sessionId } = result;
  const [talk, setTalk] = useState(false);
  const [comp, setComp] = useState(null);
  const helped = words.filter((w) => w.status === "told").length;

  return (
    <>
      <Confetti run />
      <section className="results-hero" style={{ marginBottom: 26 }}>
        <Pip mood="happy" size={170} />
        <div className="stack">
          <div className="stars" aria-label={`${report.stars} of 3 stars`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= report.stars ? "" : "dim"}>
                ⭐
              </span>
            ))}
          </div>
          <h1>You did it, {student.name}!</h1>
          <div className="row">
            <div className="speech" style={{ maxWidth: 560 }}>
              {feedback ? feedback.kid_message : "Pip is thinking about your reading…"}
            </div>
            {feedback && (
              <button className="btn small" onClick={() => say(feedback.kid_message)} aria-label="Hear Pip again">
                🔊
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="stat-row" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="v">{report.attempted - report.errors}</div>
          <div className="k">words read just right</div>
        </div>
        <div className="stat">
          <div className="v">{report.wcpm}</div>
          <div className="k">words per minute</div>
        </div>
        <div className="stat">
          <div className="v">{report.self_corrections}</div>
          <div className="k">words you fixed yourself</div>
        </div>
        <div className="stat">
          <div className="v">{helped}</div>
          <div className="k">times Pip helped</div>
        </div>
      </div>

      <article className="page" style={{ marginBottom: 26 }}>
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2>
            {passage.emoji} {passage.title}
          </h2>
          <Legend />
        </div>
        <Passage tokens={tokens} words={words} />
      </article>

      {report.tricky_words.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ marginBottom: 12 }}>Practice your tricky words</h2>
          <div className="grid practice-grid">
            {report.tricky_words.map((w) => (
              <PracticeCard key={w} word={w} />
            ))}
          </div>
        </section>
      )}

      <section className="card tilt-l spread" style={{ marginBottom: 26, background: "var(--sun-soft)" }}>
        <div className="row">
          <span style={{ fontSize: "2.4rem" }} aria-hidden>
            💬
          </span>
          <div>
            <h2>Talk with Pip about the story</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {comp
                ? `Great chat! You answered ${comp.questions_correct} of 2 questions.`
                : "Pip wants to hear what happened. Tell Pip in your own words!"}
            </p>
          </div>
        </div>
        <button className="btn primary big" onClick={() => setTalk(true)}>
          {comp ? "Talk again" : "📞 Call Pip"}
        </button>
      </section>

      <div className="row no-print">
        <a className="btn" href={`#/read/${student.id}`}>
          📚 Another story
        </a>
        <button className="btn ghost" onClick={onAgain}>
          ↻ Read this one again
        </button>
        <a className="btn ghost" href={`#/session/${sessionId}`}>
          Grown-up view →
        </a>
      </div>

      {talk && (
        <TalkWithPip
          student={student}
          passage={passage}
          sessionId={sessionId}
          onSaved={setComp}
          onClose={() => setTalk(false)}
        />
      )}
    </>
  );
}

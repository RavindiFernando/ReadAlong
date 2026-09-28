// A live voice conversation with Pip over the AssemblyAI Voice Agent API.
// The browser connects directly with a single-use token from our server,
// so the API key never reaches the client.
import { api } from "./api";
import { startMic } from "./mic";

const RATE = 24000;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64Pcm(b64) {
  const raw = atob(b64);
  const out = new Float32Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) {
    let v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}

/**
 * session:    the inline session.update config (system_prompt, greeting, tools...)
 * onToolCall: async (name, args) => result object
 * on:         { status, talking, caption, userCaption, error, ended }
 */
export async function startPipCall({ session, onToolCall, on }) {
  const { token } = await api.voiceToken();
  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`);
  const out = new AudioContext();
  await out.resume();

  let ready = false;
  let playhead = 0;
  let sources = [];
  let talkTimer = null;
  let lastEvent = null;
  let pending = [];
  let stopMic = null;
  let closed = false;

  const setTalking = (untilSec) => {
    on.talking?.(true);
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => on.talking?.(false), Math.max(0, (untilSec - out.currentTime) * 1000) + 120);
  };

  const flushTools = () => {
    if (lastEvent !== "reply.done" || !pending.length) return;
    for (const p of pending) ws.send(JSON.stringify({ type: "tool.result", ...p }));
    pending = [];
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(talkTimer);
    stopMic?.();
    sources.forEach((s) => s.stop?.());
    out.close();
    if (ws.readyState === WebSocket.OPEN) ws.close();
    on.talking?.(false);
    on.ended?.();
  };

  ws.onopen = () => ws.send(JSON.stringify({ type: "session.update", session }));
  ws.onclose = cleanup;
  ws.onerror = () => on.error?.("Connection to Pip was lost.");

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case "session.ready":
        ready = true;
        on.status?.("listening");
        break;
      case "reply.started":
      case "input.speech.started":
        lastEvent = msg.type;
        if (msg.type === "input.speech.started") on.status?.("hearing");
        break;
      case "reply.audio": {
        const samples = fromBase64Pcm(msg.data);
        const buf = out.createBuffer(1, samples.length, RATE);
        buf.getChannelData(0).set(samples);
        const src = out.createBufferSource();
        src.buffer = buf;
        src.connect(out.destination);
        playhead = Math.max(playhead, out.currentTime);
        src.start(playhead);
        playhead += buf.duration;
        sources.push(src);
        src.onended = () => (sources = sources.filter((s) => s !== src));
        setTalking(playhead);
        break;
      }
      case "transcript.agent.delta":
        on.caption?.(msg.delta, false);
        break;
      case "transcript.agent":
        on.caption?.(msg.text, true);
        break;
      case "transcript.user.delta":
        on.userCaption?.(msg.text, false);
        break;
      case "transcript.user":
        on.userCaption?.(msg.text, true);
        on.status?.("listening");
        break;
      case "reply.done":
        lastEvent = "reply.done";
        if (msg.status === "interrupted") {
          sources.forEach((s) => s.stop());
          sources = [];
          playhead = out.currentTime;
          pending = [];
        }
        flushTools();
        break;
      case "tool.call": {
        let result;
        try {
          result = { result: JSON.stringify(await onToolCall(msg.name, msg.arguments)) };
        } catch (e) {
          result = { result: JSON.stringify({ error: String(e) }), is_error: true };
        }
        pending.push({ call_id: msg.call_id, ...result });
        flushTools();
        break;
      }
      case "session.error":
        on.error?.(msg.message || "Pip had a problem.");
        break;
      case "session.ended":
        cleanup();
        break;
    }
  };

  stopMic = await startMic({
    rate: RATE,
    onChunk: (pcm) => {
      if (ready && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input.audio", audio: toBase64(pcm) }));
      }
    },
  });

  const end = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session.end" }));
      setTimeout(cleanup, 1500);
    } else {
      cleanup();
    }
  };
  window.addEventListener("pagehide", end, { once: true });
  return { end };
}

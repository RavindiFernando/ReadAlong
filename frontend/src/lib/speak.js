// Browser speech for instant, tiny prompts (a stuck word, a practice word).
// Conversations with Pip use the AssemblyAI Voice Agent instead.
let voice = null;

function pickVoice() {
  if (voice) return voice;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  const preferred = ["Samantha", "Google US English", "Microsoft Aria", "Karen", "Moira"];
  voice = preferred.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) || voices[0] || null;
  return voice;
}

if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = () => {
    voice = null;
    pickVoice();
  };
}

export function say(text, { rate = 0.95, pitch = 1.1 } = {}) {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = pickVoice();
    u.rate = rate;
    u.pitch = pitch;
    u.onend = u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

export function sayWord(word) {
  return say(word.replace(/[^\p{L}'’-]/gu, ""), { rate: 0.7, pitch: 1.05 });
}

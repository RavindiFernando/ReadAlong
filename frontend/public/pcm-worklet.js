// Captures mic audio, resamples to the target rate and posts PCM16 frames
// of ~100 ms (AssemblyAI streaming wants 50-1000 ms per message), plus a
// level reading for the UI.
class PCMWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { inputSampleRate, targetSampleRate } = options.processorOptions;
    this.ratio = inputSampleRate / targetSampleRate;
    this.frame = Math.round(targetSampleRate / 10);
    this.buf = new Int16Array(this.frame);
    this.len = 0;
    this.pos = 0; // fractional read position carried across blocks
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    while (this.pos < input.length) {
      const s = Math.max(-1, Math.min(1, input[Math.floor(this.pos)]));
      this.peak = Math.max(this.peak, Math.abs(s));
      this.buf[this.len++] = s < 0 ? s * 32768 : s * 32767;
      if (this.len === this.frame) {
        const out = this.buf;
        this.port.postMessage({ pcm: out.buffer, level: this.peak }, [out.buffer]);
        this.buf = new Int16Array(this.frame);
        this.len = 0;
        this.peak = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);

// Opens the microphone and streams PCM16 at `rate` Hz in ~100 ms frames.
// The AudioContext runs at the device rate and the worklet resamples, which
// keeps echo cancellation working on Firefox and audio correct on Safari.
export async function startMic({ rate, onChunk, onLevel }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext();
  await ctx.resume();
  await ctx.audioWorklet.addModule("/pcm-worklet.js");
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-worklet", {
    processorOptions: { inputSampleRate: ctx.sampleRate, targetSampleRate: rate },
  });
  node.port.onmessage = (e) => {
    onChunk(e.data.pcm);
    onLevel?.(e.data.level);
  };
  source.connect(node);

  return () => {
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}

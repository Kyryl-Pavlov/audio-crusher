/** Returns a time-reversed copy of `buffer` (every channel's samples in reverse order). */
export function reverseAudioBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = reversed.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
  }
  return reversed;
}

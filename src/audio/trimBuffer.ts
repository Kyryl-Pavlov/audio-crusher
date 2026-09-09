/** Returns a new AudioBuffer containing only the [startSec, endSec) slice of `buffer`. */
export function trimAudioBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const startSample = Math.max(0, Math.min(buffer.length, Math.floor(startSec * buffer.sampleRate)));
  const endSample = Math.max(startSample, Math.min(buffer.length, Math.ceil(endSec * buffer.sampleRate)));
  const length = Math.max(1, endSample - startSample);

  const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    trimmed.getChannelData(ch).set(buffer.getChannelData(ch).subarray(startSample, startSample + length));
  }
  return trimmed;
}

// Reverse delay: continuously records the input into fixed-length blocks and plays
// each finished block back reversed while the next one is being recorded, so every
// repeat runs backwards. That alternating record/reverse-playback swap needs real
// sample-level double buffering a native node graph can't express, hence a worklet.
// Feedback recirculates a portion of the reversed output back into the block
// currently being recorded, so each pass carries a decaying trace of the one before.
const MAX_TIME_SECONDS = 2;
// Fading each reversed block in/out over this long removes the hard jump to full
// amplitude at the block boundary - otherwise audible as a click, an unnaturally
// sharp attack, and a peak spike right at the seam - and gives the effect its
// intended smooth swell into (and out of) each repeat.
const EDGE_FADE_SECONDS = 0.02;

class ReverseDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "time", defaultValue: 0.3, minValue: 0.05, maxValue: MAX_TIME_SECONDS },
      { name: "feedback", defaultValue: 0, minValue: 0, maxValue: 0.95 },
    ];
  }

  constructor() {
    super();
    this.maxSamples = Math.ceil(sampleRate * MAX_TIME_SECONDS);
    this.edgeFadeSamples = Math.max(1, Math.round(sampleRate * EDGE_FADE_SECONDS));
    // Two block buffers per channel: while one is being recorded, the other (the
    // previously completed block) is read back in reverse.
    this.buffers = [[], []];
    this.blockLength = [1, 1];
    this.currentBlockLength = 1;
    this.active = 0;
    this.writePos = 0;
    this.readPos = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    const channels = output.length;
    for (const bufSet of this.buffers) {
      while (bufSet.length < channels) bufSet.push(new Float32Array(this.maxSamples));
    }

    const timeParam = parameters.time;
    const feedbackParam = parameters.feedback;
    const frames = output[0].length;

    for (let i = 0; i < frames; i++) {
      // Block length is only re-sampled at the start of a fresh recording, so a
      // mid-block change in `time` can't shrink/grow the buffer out from under the
      // read side that's currently indexing into it.
      if (this.writePos === 0) {
        const time = timeParam.length > 1 ? timeParam[i] : timeParam[0];
        this.currentBlockLength = Math.max(1, Math.min(this.maxSamples, Math.round(time * sampleRate)));
      }
      const feedback = feedbackParam.length > 1 ? feedbackParam[i] : feedbackParam[0];

      const readBuf = 1 - this.active;
      const readLen = this.blockLength[readBuf];
      const canRead = this.readPos < readLen;
      const reverseIndex = readLen - 1 - this.readPos;
      // Triangular taper into/out of the block: for a block shorter than two fade
      // windows this naturally shrinks to a single smooth peak instead of a
      // flat-topped plateau, so it never re-introduces a hard edge.
      const fadeIn = this.readPos / this.edgeFadeSamples;
      const fadeOut = (readLen - 1 - this.readPos) / this.edgeFadeSamples;
      const envelope = canRead ? Math.min(1, fadeIn, fadeOut) : 0;

      const writeBufSet = this.buffers[this.active];
      const readBufSet = this.buffers[readBuf];

      for (let ch = 0; ch < channels; ch++) {
        const inCh = input[ch] ?? input[0];
        const liveSample = inCh ? inCh[i] : 0;
        const wetSample = canRead ? readBufSet[ch][reverseIndex] * envelope : 0;
        // Soft-saturating only the recirculated portion caps how far repeated passes
        // can build up a sustained signal's level - unbounded (1/(1-feedback)) if fed
        // back linearly - so higher feedback settings decay toward a ceiling instead
        // of peaking harder with every repeat.
        writeBufSet[ch][this.writePos] = liveSample + Math.tanh(feedback * wetSample);
        output[ch][i] = wetSample;
      }

      this.writePos++;
      this.readPos++;
      if (this.writePos >= this.currentBlockLength) {
        this.blockLength[this.active] = this.currentBlockLength;
        this.active = readBuf;
        this.writePos = 0;
        this.readPos = 0;
      }
    }
    return true;
  }
}

registerProcessor("reverse-delay-processor", ReverseDelayProcessor);

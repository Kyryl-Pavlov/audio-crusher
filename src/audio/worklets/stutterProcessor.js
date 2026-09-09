// Granular stutter/glitch: continuously records the live signal into a ring buffer.
// While inactive it's pure passthrough. The instant `active` goes high it snapshots
// the last `windowMs` of that ring buffer and loops that fixed slice indefinitely
// until `active` drops again - this needs real sample-level buffering a native node
// graph can't express, hence a worklet.
const MAX_WINDOW_SECONDS = 0.3;

class StutterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "windowMs", defaultValue: 100, minValue: 20, maxValue: 300 },
      { name: "active", defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.maxSamples = Math.ceil(sampleRate * MAX_WINDOW_SECONDS);
    this.ring = [];
    this.writeIndex = 0;
    this.wasActive = false;
    this.captureLength = 1;
    this.captureStart = 0;
    this.readOffset = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    while (this.ring.length < output.length) this.ring.push(new Float32Array(this.maxSamples));

    const windowParam = parameters.windowMs;
    const activeParam = parameters.active;
    const frames = output[0].length;

    for (let i = 0; i < frames; i++) {
      const active = (activeParam.length > 1 ? activeParam[i] : activeParam[0]) >= 0.5;
      const windowMs = windowParam.length > 1 ? windowParam[i] : windowParam[0];

      if (active && !this.wasActive) {
        this.captureLength = Math.max(1, Math.min(this.maxSamples, Math.round((windowMs / 1000) * sampleRate)));
        this.captureStart = (this.writeIndex - this.captureLength + this.maxSamples) % this.maxSamples;
        this.readOffset = 0;
      }
      this.wasActive = active;

      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input[ch] ?? input[0];
        const liveSample = inCh ? inCh[i] : 0;
        const ringCh = this.ring[ch];

        if (!active) {
          ringCh[this.writeIndex] = liveSample;
          output[ch][i] = liveSample;
        } else {
          const readIndex = (this.captureStart + this.readOffset) % this.maxSamples;
          output[ch][i] = ringCh[readIndex];
        }
      }

      if (!active) {
        this.writeIndex = (this.writeIndex + 1) % this.maxSamples;
      } else {
        this.readOffset = (this.readOffset + 1) % this.captureLength;
      }
    }
    return true;
  }
}

registerProcessor("stutter-processor", StutterProcessor);

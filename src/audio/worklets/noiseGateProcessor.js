// Native Web Audio nodes can't express amplitude-gated muting, so this is a real
// AudioWorkletProcessor: tracks a shared (max-across-channels) envelope, opens fast
// when the signal crosses the threshold and closes over `releaseMs` when it drops
// below it, and multiplies every channel by that one envelope so the stereo image
// never shifts between channels opening/closing at slightly different times.
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "thresholdDb", defaultValue: -40, minValue: -80, maxValue: 0 },
      { name: "releaseMs", defaultValue: 150, minValue: 10, maxValue: 1000 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    const thresholdParam = parameters.thresholdDb;
    const releaseParam = parameters.releaseMs;
    const frames = output[0].length;

    for (let i = 0; i < frames; i++) {
      const thresholdDb = thresholdParam.length > 1 ? thresholdParam[i] : thresholdParam[0];
      const releaseMs = releaseParam.length > 1 ? releaseParam[i] : releaseParam[0];
      const thresholdLinear = Math.pow(10, thresholdDb / 20);

      let level = 0;
      for (let ch = 0; ch < input.length; ch++) {
        const sample = input[ch][i];
        if (sample !== undefined) level = Math.max(level, Math.abs(sample));
      }

      const target = level > thresholdLinear ? 1 : 0;
      const releaseCoeff = Math.exp(-1 / (sampleRate * (releaseMs / 1000)));
      const coeff = target > this.envelope ? 0.6 : releaseCoeff;
      this.envelope = target + (this.envelope - target) * coeff;

      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input[ch] ?? input[0];
        output[ch][i] = (inCh ? inCh[i] : 0) * this.envelope;
      }
    }
    return true;
  }
}

registerProcessor("noise-gate-processor", NoiseGateProcessor);

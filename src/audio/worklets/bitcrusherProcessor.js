// Bit-depth quantization alone is doable with a WaveShaperNode, but real sample-rate
// reduction (holding a sample for N frames) needs an actual per-sample loop, hence a
// worklet: a phase counter advances each frame, and only when it wraps does the
// processor sample a fresh input value, quantize it to 2^bits levels, and hold it
// until the next wrap - the classic "sample and hold" lo-fi crush.
class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "bits", defaultValue: 8, minValue: 1, maxValue: 16 },
      { name: "rateReduction", defaultValue: 4, minValue: 1, maxValue: 50 },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.held = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    const bitsParam = parameters.bits;
    const rateParam = parameters.rateReduction;
    const frames = output[0].length;

    while (this.held.length < output.length) this.held.push(0);

    for (let i = 0; i < frames; i++) {
      const bits = Math.round(bitsParam.length > 1 ? bitsParam[i] : bitsParam[0]);
      const step = Math.max(1, Math.round(rateParam.length > 1 ? rateParam[i] : rateParam[0]));
      const levels = Math.pow(2, bits);

      const shouldSample = this.phase % step === 0;
      this.phase++;

      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input[ch] ?? input[0];
        if (shouldSample) {
          const raw = inCh ? inCh[i] : 0;
          this.held[ch] = Math.round(raw * levels) / levels;
        }
        output[ch][i] = this.held[ch];
      }
    }
    return true;
  }
}

registerProcessor("bitcrusher-processor", BitcrusherProcessor);

import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const RECTIFY_CURVE_SAMPLES = 1024;

/** Builds a WaveShaperNode curve computing y=|x|, the rectifying stage of an envelope follower. */
function buildRectifyCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(RECTIFY_CURVE_SAMPLES);
  for (let i = 0; i < RECTIFY_CURVE_SAMPLES; i++) {
    const x = (i / (RECTIFY_CURVE_SAMPLES - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

/**
 * Auto-wah / envelope filter: rectifies the input (WaveShaper y=|x|), smooths it into
 * an envelope (lowpass filter), and uses that envelope to sweep a bandpass filter's
 * frequency upward from a base value - a standard native-node envelope follower.
 */
export class AutoWahModule implements EffectModule {
  readonly type = "auto-wah" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly bandpass: BiquadFilterNode;
  private readonly rectifier: WaveShaperNode;
  private readonly envelopeFilter: BiquadFilterNode;
  private readonly sensitivityGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.7;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.bandpass = ctx.createBiquadFilter();
    this.bandpass.type = "bandpass";
    this.bandpass.frequency.value = 500;
    this.bandpass.Q.value = 3;

    this.rectifier = ctx.createWaveShaper();
    this.rectifier.curve = buildRectifyCurve();
    this.envelopeFilter = ctx.createBiquadFilter();
    this.envelopeFilter.type = "lowpass";
    this.envelopeFilter.frequency.value = 15;
    this.sensitivityGain = ctx.createGain();
    this.sensitivityGain.gain.value = 0;

    this.input.connect(this.rectifier);
    this.rectifier.connect(this.envelopeFilter);
    this.envelopeFilter.connect(this.sensitivityGain);
    this.sensitivityGain.connect(this.bandpass.frequency);

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.bandpass);
    this.bandpass.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setSensitivity(amount01: number) {
    ramp(this.ctx, this.sensitivityGain.gain, amount01 * 4000);
  }

  setBaseFreq(hz: number) {
    ramp(this.ctx, this.bandpass.frequency, hz);
  }

  setMix(mix: number) {
    this.mix = mix;
    this.applyMix();
  }

  private applyMix() {
    ramp(this.ctx, this.wetGain.gain, this.enabled ? this.mix : 0);
    ramp(this.ctx, this.dryGain.gain, this.enabled ? 1 - this.mix : 1);
  }

  dispose() {
    this.input.disconnect();
    this.rectifier.disconnect();
    this.envelopeFilter.disconnect();
    this.sensitivityGain.disconnect();
    this.bandpass.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

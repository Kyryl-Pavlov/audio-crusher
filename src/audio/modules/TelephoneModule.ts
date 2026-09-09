import { generateDriveCurve } from "../distortionCurve";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Telephone/AM-radio filter: band-limits to 300-3400Hz plus light waveshaping, mixed with dry. */
export class TelephoneModule implements EffectModule {
  readonly type = "telephone" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly highpass: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly shaper: WaveShaperNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.8;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 300;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 3400;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    this.shaper.curve = generateDriveCurve("distortion", 0.3);

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.shaper);
    this.shaper.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setCrunch(amount: number) {
    this.shaper.curve = generateDriveCurve("distortion", amount);
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
    this.highpass.disconnect();
    this.lowpass.disconnect();
    this.shaper.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

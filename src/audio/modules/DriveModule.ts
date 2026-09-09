import { generateDriveCurve, type DriveType } from "../distortionCurve";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Overdrive/distortion via waveshaping, with a post-drive tone filter and dry/wet mix. */
export class DriveModule implements EffectModule {
  readonly type = "drive" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly shaper: WaveShaperNode;
  private readonly toneFilter: BiquadFilterNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private enabled = false;
  private driveType: DriveType = "overdrive";
  private amount = 0.4;
  private mix = 0.4;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "4x";
    this.shaper.curve = generateDriveCurve(this.driveType, this.amount);

    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 12000;
    this.toneFilter.Q.value = 0.707;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.shaper);
    this.shaper.connect(this.toneFilter);
    this.toneFilter.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setType(type: DriveType) {
    this.driveType = type;
    this.shaper.curve = generateDriveCurve(type, this.amount);
  }

  setAmount(amount: number) {
    this.amount = amount;
    this.shaper.curve = generateDriveCurve(this.driveType, amount);
  }

  setTone(hz: number) {
    ramp(this.ctx, this.toneFilter.frequency, hz);
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
    this.shaper.disconnect();
    this.toneFilter.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

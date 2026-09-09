import { generateDriveCurve } from "../distortionCurve";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const LOW_CROSSOVER_HZ = 400;
const HIGH_CROSSOVER_HZ = 2500;

/**
 * Multiband distortion: splits the signal into low/mid/high bands via crossover
 * filters, waveshapes each independently (reusing the same drive-curve generator as
 * DriveModule), then sums the bands and mixes with dry.
 */
export class MultibandDistortionModule implements EffectModule {
  readonly type = "multiband-distortion" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly lowFilter: BiquadFilterNode;
  private readonly midFilterLow: BiquadFilterNode;
  private readonly midFilterHigh: BiquadFilterNode;
  private readonly highFilter: BiquadFilterNode;
  private readonly lowShaper: WaveShaperNode;
  private readonly midShaper: WaveShaperNode;
  private readonly highShaper: WaveShaperNode;
  private readonly bandSum: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.5;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.lowFilter = ctx.createBiquadFilter();
    this.lowFilter.type = "lowpass";
    this.lowFilter.frequency.value = LOW_CROSSOVER_HZ;

    this.midFilterLow = ctx.createBiquadFilter();
    this.midFilterLow.type = "highpass";
    this.midFilterLow.frequency.value = LOW_CROSSOVER_HZ;
    this.midFilterHigh = ctx.createBiquadFilter();
    this.midFilterHigh.type = "lowpass";
    this.midFilterHigh.frequency.value = HIGH_CROSSOVER_HZ;

    this.highFilter = ctx.createBiquadFilter();
    this.highFilter.type = "highpass";
    this.highFilter.frequency.value = HIGH_CROSSOVER_HZ;

    this.lowShaper = ctx.createWaveShaper();
    this.lowShaper.oversample = "2x";
    this.lowShaper.curve = generateDriveCurve("distortion", 0.3);
    this.midShaper = ctx.createWaveShaper();
    this.midShaper.oversample = "2x";
    this.midShaper.curve = generateDriveCurve("distortion", 0.3);
    this.highShaper = ctx.createWaveShaper();
    this.highShaper.oversample = "2x";
    this.highShaper.curve = generateDriveCurve("distortion", 0.3);

    this.bandSum = ctx.createGain();

    this.input.connect(this.lowFilter);
    this.lowFilter.connect(this.lowShaper);
    this.lowShaper.connect(this.bandSum);

    this.input.connect(this.midFilterLow);
    this.midFilterLow.connect(this.midFilterHigh);
    this.midFilterHigh.connect(this.midShaper);
    this.midShaper.connect(this.bandSum);

    this.input.connect(this.highFilter);
    this.highFilter.connect(this.highShaper);
    this.highShaper.connect(this.bandSum);

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.bandSum.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setLow(amount: number) {
    this.lowShaper.curve = generateDriveCurve("distortion", amount);
  }

  setMid(amount: number) {
    this.midShaper.curve = generateDriveCurve("distortion", amount);
  }

  setHigh(amount: number) {
    this.highShaper.curve = generateDriveCurve("distortion", amount);
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
    this.lowFilter.disconnect();
    this.midFilterLow.disconnect();
    this.midFilterHigh.disconnect();
    this.highFilter.disconnect();
    this.lowShaper.disconnect();
    this.midShaper.disconnect();
    this.highShaper.disconnect();
    this.bandSum.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

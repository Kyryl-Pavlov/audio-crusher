import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Dynamics compressor (native DynamicsCompressorNode) with a dry/wet mix for parallel compression. */
export class CompressorModule implements EffectModule {
  readonly type = "compressor" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly compressor: DynamicsCompressorNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 1;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.2;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.compressor);
    this.compressor.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setThreshold(db: number) {
    ramp(this.ctx, this.compressor.threshold, db);
  }

  setRatio(ratio: number) {
    ramp(this.ctx, this.compressor.ratio, ratio);
  }

  setAttack(seconds: number) {
    ramp(this.ctx, this.compressor.attack, seconds);
  }

  setRelease(seconds: number) {
    ramp(this.ctx, this.compressor.release, seconds);
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
    this.compressor.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

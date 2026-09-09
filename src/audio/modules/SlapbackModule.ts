import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Slapback delay: a short (60-150ms) single echo with no feedback loop, for rockabilly-style doubling. */
export class SlapbackModule implements EffectModule {
  readonly type = "slapback" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly delayNode: DelayNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.35;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delayNode = ctx.createDelay(0.2);
    this.delayNode.delayTime.value = 0.11;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setTime(seconds: number) {
    ramp(this.ctx, this.delayNode.delayTime, seconds);
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
    this.delayNode.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Feedback delay line with a damping filter in the feedback loop, and a dry/wet mix. */
export class DelayModule implements EffectModule {
  readonly type = "delay" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly delayNode: DelayNode;
  private readonly filter: BiquadFilterNode;
  private readonly feedbackGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private enabled = false;
  private mix = 0.25;
  private feedback = 0.3;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delayNode = ctx.createDelay(2);
    this.delayNode.delayTime.value = 0.3;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 4000;
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0;
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.filter);
    this.filter.connect(this.wetGain);
    this.filter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
    ramp(this.ctx, this.feedbackGain.gain, enabled ? this.feedback : 0);
  }

  setTime(seconds: number) {
    ramp(this.ctx, this.delayNode.delayTime, seconds);
  }

  setFeedback(amount: number) {
    this.feedback = amount;
    if (this.enabled) ramp(this.ctx, this.feedbackGain.gain, amount);
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
    this.filter.disconnect();
    this.feedbackGain.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

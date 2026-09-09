import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Wraps the reverse-delay AudioWorkletProcessor (registered once in EffectsGraph.create()).
 * `time` only takes effect at the processor's next block boundary, so it's snapped like
 * StutterModule's `windowMs` rather than ramped; `feedback` is applied continuously every
 * sample, so it gets the usual smoothed ramp.
 */
export class ReverseDelayModule implements EffectModule {
  readonly type = "reverse-delay" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly node: AudioWorkletNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.4;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.node = new AudioWorkletNode(ctx, "reverse-delay-processor");
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.node);
    this.node.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setTime(seconds: number) {
    const now = this.ctx.currentTime;
    const param = this.node.parameters.get("time")!;
    param.cancelScheduledValues(now);
    param.setValueAtTime(seconds, now);
  }

  setFeedback(amount: number) {
    ramp(this.ctx, this.node.parameters.get("feedback")!, amount);
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
    this.node.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

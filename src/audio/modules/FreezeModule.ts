import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const FROZEN_FEEDBACK = 0.995;

/**
 * Freeze / infinite sustain: a short delay loop whose feedback snaps to near-unity
 * when triggered, capturing and indefinitely sustaining whatever's circulating at
 * that instant. New input and the dry path are muted while frozen so only the
 * captured loop plays; unfrozen it's a transparent passthrough (loop muted, feedback 0).
 */
export class FreezeModule implements EffectModule {
  readonly type = "freeze" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly delayNode: DelayNode;
  private readonly feedbackGain: GainNode;
  private readonly inputGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly loopGain: GainNode;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delayNode = ctx.createDelay(0.3);
    this.delayNode.delayTime.value = 0.12;
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;
    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0;
    this.loopGain = ctx.createGain();
    this.loopGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.inputGain);
    this.inputGain.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.loopGain);
    this.loopGain.connect(this.output);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
  }

  setEnabled(frozen: boolean) {
    ramp(this.ctx, this.feedbackGain.gain, frozen ? FROZEN_FEEDBACK : 0);
    ramp(this.ctx, this.inputGain.gain, frozen ? 0 : 1);
    ramp(this.ctx, this.dryGain.gain, frozen ? 0 : 1);
    ramp(this.ctx, this.loopGain.gain, frozen ? 1 : 0);
  }

  setTime(seconds: number) {
    ramp(this.ctx, this.delayNode.delayTime, seconds);
  }

  dispose() {
    this.input.disconnect();
    this.inputGain.disconnect();
    this.delayNode.disconnect();
    this.feedbackGain.disconnect();
    this.loopGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

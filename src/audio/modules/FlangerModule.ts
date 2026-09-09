import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const BASE_DELAY_SECONDS = 0.003;

/** Flanger: a very short delay modulated by an LFO, with feedback, mixed with dry. */
export class FlangerModule implements EffectModule {
  readonly type = "flanger" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly delayNode: DelayNode;
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;
  private readonly feedbackGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.5;
  private feedback = 0.5;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delayNode = ctx.createDelay(0.02);
    this.delayNode.delayTime.value = BASE_DELAY_SECONDS;
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.25;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(this.delayNode.delayTime);
    this.lfo.start();

    this.feedbackGain = ctx.createGain();
    this.feedbackGain.gain.value = 0;
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
    ramp(this.ctx, this.feedbackGain.gain, enabled ? this.feedback : 0);
  }

  setRate(hz: number) {
    ramp(this.ctx, this.lfo.frequency, hz);
  }

  setDepth(ms: number) {
    ramp(this.ctx, this.depthGain.gain, ms / 1000);
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
    this.lfo.stop();
    this.lfo.disconnect();
    this.depthGain.disconnect();
    this.input.disconnect();
    this.delayNode.disconnect();
    this.feedbackGain.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

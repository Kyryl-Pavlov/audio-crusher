import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const BASE_DELAY_SECONDS = 0.015;

/** Chorus: a short delay modulated by an LFO, mixed with the dry signal. */
export class ChorusModule implements EffectModule {
  readonly type = "chorus" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly delayNode: DelayNode;
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.35;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delayNode = ctx.createDelay(0.05);
    this.delayNode.delayTime.value = BASE_DELAY_SECONDS;
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.8;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(this.delayNode.delayTime);
    this.lfo.start();

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

  setRate(hz: number) {
    ramp(this.ctx, this.lfo.frequency, hz);
  }

  setDepth(ms: number) {
    ramp(this.ctx, this.depthGain.gain, ms / 1000);
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
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

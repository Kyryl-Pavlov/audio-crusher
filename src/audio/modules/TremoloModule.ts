import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Tremolo: an LFO modulates the main-path gain directly (amplitude modulation).
 * The gain's intrinsic base value is set to (1 - depth/2) and the LFO swings
 * +/-depth/2 around it, so the signal ranges over [1-depth, 1] - never boosted.
 */
export class TremoloModule implements EffectModule {
  readonly type = "tremolo" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;
  private enabled = false;
  private depth01 = 0.5;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    const gain = ctx.createGain();
    this.input = gain;
    this.output = gain;
    gain.gain.value = 1;

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 5;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(gain.gain);
    this.lfo.start();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyDepth();
  }

  setRate(hz: number) {
    ramp(this.ctx, this.lfo.frequency, hz);
  }

  setDepth(amount01: number) {
    this.depth01 = amount01;
    this.applyDepth();
  }

  private applyDepth() {
    const depth = this.enabled ? this.depth01 : 0;
    ramp(this.ctx, this.output.gain, 1 - depth / 2);
    ramp(this.ctx, this.depthGain.gain, depth / 2);
  }

  dispose() {
    this.lfo.stop();
    this.lfo.disconnect();
    this.depthGain.disconnect();
    this.input.disconnect();
  }
}

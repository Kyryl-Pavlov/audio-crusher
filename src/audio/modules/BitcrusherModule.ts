import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** Wraps the bitcrusher AudioWorkletProcessor (registered once in EffectsGraph.create()), with a dry/wet mix. */
export class BitcrusherModule implements EffectModule {
  readonly type = "bitcrusher" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly node: AudioWorkletNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.6;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.node = new AudioWorkletNode(ctx, "bitcrusher-processor");
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

  setBits(bits: number) {
    ramp(this.ctx, this.node.parameters.get("bits")!, bits);
  }

  setRateReduction(steps: number) {
    ramp(this.ctx, this.node.parameters.get("rateReduction")!, steps);
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

import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const STAGE_COUNT = 4;
const BASE_FREQ = 800;

/** Phaser: a cascade of allpass filters with an LFO sweeping their frequency together. */
export class PhaserModule implements EffectModule {
  readonly type = "phaser" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly stages: BiquadFilterNode[];
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.5;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.stages = Array.from({ length: STAGE_COUNT }, () => {
      const filter = ctx.createBiquadFilter();
      filter.type = "allpass";
      filter.frequency.value = BASE_FREQ;
      filter.Q.value = 1;
      return filter;
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.3;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.stages.forEach((stage) => this.depthGain.connect(stage.frequency));
    this.lfo.start();

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.stages[0]);
    for (let i = 0; i < this.stages.length - 1; i++) this.stages[i].connect(this.stages[i + 1]);
    this.stages[this.stages.length - 1].connect(this.wetGain);
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

  setDepth(hzRange: number) {
    ramp(this.ctx, this.depthGain.gain, hzRange);
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
    this.stages.forEach((s) => s.disconnect());
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

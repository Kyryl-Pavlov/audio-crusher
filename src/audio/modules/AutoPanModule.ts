import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/** LFO-driven stereo auto-pan ("8D audio"). Transparent passthrough when disabled. */
export class AutoPanModule implements EffectModule {
  readonly type = "auto-pan" as const;
  readonly input: StereoPannerNode;
  readonly output: StereoPannerNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    const panner = ctx.createStereoPanner();
    this.input = panner;
    this.output = panner;

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.2;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(panner.pan);
    this.lfo.start();
  }

  setEnabled(enabled: boolean) {
    ramp(this.ctx, this.depthGain.gain, enabled ? 1 : 0);
  }

  setRate(hz: number) {
    ramp(this.ctx, this.lfo.frequency, hz);
  }

  dispose() {
    this.lfo.stop();
    this.lfo.disconnect();
    this.depthGain.disconnect();
    this.input.disconnect();
  }
}

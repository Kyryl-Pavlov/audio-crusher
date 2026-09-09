import { ramp } from "../ramp";
import type { EffectModule } from "./types";

const SHAPE_CURVE_SAMPLES = 1024;

/**
 * Maps a linear sawtooth ramp (-1..1) into a percussive "duck then recover" envelope
 * in [0,1]: 0 right after the sawtooth resets (the "hit"), rising back to 1 just
 * before the next reset - the classic sidechain-compressor pumping shape.
 */
function buildDuckCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(SHAPE_CURVE_SAMPLES);
  for (let i = 0; i < SHAPE_CURVE_SAMPLES; i++) {
    const u = i / (SHAPE_CURVE_SAMPLES - 1);
    curve[i] = Math.pow(u, 2);
  }
  return curve;
}

/** Sidechain ducking: a shaped sawtooth LFO drives the main-path gain for rhythmic "pumping". */
export class SidechainModule implements EffectModule {
  readonly type = "sidechain" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly lfo: OscillatorNode;
  private readonly shaper: WaveShaperNode;
  private readonly depthGain: GainNode;
  private enabled = false;
  private depth01 = 0.6;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    const gain = ctx.createGain();
    this.input = gain;
    this.output = gain;

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sawtooth";
    this.lfo.frequency.value = 2;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = buildDuckCurve();
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;

    this.lfo.connect(this.shaper);
    this.shaper.connect(this.depthGain);
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
    ramp(this.ctx, this.output.gain, 1 - depth);
    ramp(this.ctx, this.depthGain.gain, depth);
  }

  dispose() {
    this.lfo.stop();
    this.lfo.disconnect();
    this.shaper.disconnect();
    this.depthGain.disconnect();
    this.input.disconnect();
  }
}

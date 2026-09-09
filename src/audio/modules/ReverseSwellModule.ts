import { generateReverseSwellImpulseResponse, type SwellLength } from "../impulseResponse";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

// Rising-envelope IRs are pure functions of (context, length), so instances sharing a
// length share one generated AudioBuffer instead of re-synthesizing it.
const irCache = new Map<SwellLength, AudioBuffer>();
function getSwellImpulseResponse(ctx: BaseAudioContext, length: SwellLength): AudioBuffer {
  let buffer = irCache.get(length);
  if (!buffer) {
    buffer = generateReverseSwellImpulseResponse(ctx, length);
    irCache.set(length, buffer);
  }
  return buffer;
}

/** Reverse-reverb-style swell: convolution with a rising (rather than decaying) impulse response. */
export class ReverseSwellModule implements EffectModule {
  readonly type = "reverse-swell" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.5;
  private length: SwellLength = "medium";

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = getSwellImpulseResponse(ctx, this.length);
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setLength(length: SwellLength) {
    this.length = length;
    this.convolver.buffer = getSwellImpulseResponse(this.ctx, length);
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
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

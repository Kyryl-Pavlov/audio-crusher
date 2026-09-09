import { generateImpulseResponse, type ReverbType } from "../impulseResponse";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

// Impulse responses are pure functions of (context, type), so every instance of the
// same space shares one generated AudioBuffer instead of re-synthesizing it per instance.
const irCache = new Map<ReverbType, AudioBuffer>();
function getImpulseResponse(ctx: BaseAudioContext, type: ReverbType): AudioBuffer {
  let buffer = irCache.get(type);
  if (!buffer) {
    buffer = generateImpulseResponse(ctx, type);
    irCache.set(type, buffer);
  }
  return buffer;
}

/** Convolution reverb (room/hall/cathedral) with a dry/wet mix. */
export class ReverbModule implements EffectModule {
  readonly type = "reverb" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private enabled = false;
  private mix = 0.35;
  private reverbType: ReverbType = "hall";

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = getImpulseResponse(ctx, this.reverbType);
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

  setType(type: ReverbType) {
    this.reverbType = type;
    this.convolver.buffer = getImpulseResponse(this.ctx, type);
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

import { generateCabinetImpulseResponse, type CabinetType } from "../impulseResponse";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

// Cabinet IRs are pure functions of (context, type), so instances of the same type
// share one generated AudioBuffer instead of re-synthesizing it.
const irCache = new Map<CabinetType, AudioBuffer>();
function getCabinetImpulseResponse(ctx: BaseAudioContext, type: CabinetType): AudioBuffer {
  let buffer = irCache.get(type);
  if (!buffer) {
    buffer = generateCabinetImpulseResponse(ctx, type);
    irCache.set(type, buffer);
  }
  return buffer;
}

/** Cabinet/speaker sim: convolution with a short, resonance-colored IR per playback device type. */
export class CabinetModule implements EffectModule {
  readonly type = "cabinet" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.6;
  private cabinetType: CabinetType = "small-speaker";

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = getCabinetImpulseResponse(ctx, this.cabinetType);
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

  setCabinetType(type: CabinetType) {
    this.cabinetType = type;
    this.convolver.buffer = getCabinetImpulseResponse(this.ctx, type);
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

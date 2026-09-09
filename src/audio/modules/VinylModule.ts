import { generateVinylNoiseBuffer, type VinylIntensity } from "../vinylNoise";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Dusty vinyl noise bed. Not a true insert effect — the input passes straight
 * through at unity gain, and this instance's own looping noise source is summed
 * additively into the same output node.
 */
export class VinylModule implements EffectModule {
  readonly type = "vinyl" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly filter: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private source: AudioBufferSourceNode | null = null;

  readonly id: string;
  private readonly ctx: AudioContext;
  private enabled = false;
  private amount = 0.3;
  private intensity: VinylIntensity = "medium";

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "highpass";
    this.filter.frequency.value = 100;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.filter.connect(this.noiseGain);
    this.noiseGain.connect(this.output);

    this.restartSource();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    ramp(this.ctx, this.noiseGain.gain, enabled ? this.amount : 0);
  }

  setAmount(amount: number) {
    this.amount = amount;
    if (this.enabled) ramp(this.ctx, this.noiseGain.gain, amount);
  }

  setIntensity(intensity: VinylIntensity) {
    this.intensity = intensity;
    this.restartSource();
  }

  private restartSource() {
    const buffer = generateVinylNoiseBuffer(this.ctx, this.intensity);
    const next = this.ctx.createBufferSource();
    next.buffer = buffer;
    next.loop = true;
    next.connect(this.filter);
    next.start();

    const previous = this.source;
    this.source = next;
    if (previous) {
      previous.stop();
      previous.disconnect();
    }
  }

  dispose() {
    this.source?.stop();
    this.source?.disconnect();
    this.input.disconnect();
    this.filter.disconnect();
    this.noiseGain.disconnect();
    this.output.disconnect();
  }
}

import { ramp } from "../ramp";
import type { EffectModule, VowelType } from "./types";

interface FormantSet {
  f1: number;
  f2: number;
  f3: number;
}

const VOWEL_FORMANTS: Record<VowelType, FormantSet> = {
  a: { f1: 700, f2: 1220, f3: 2600 },
  e: { f1: 400, f2: 2000, f3: 2550 },
  i: { f1: 280, f2: 2250, f3: 2890 },
  o: { f1: 450, f2: 800, f3: 2830 },
  u: { f1: 325, f2: 700, f3: 2530 },
};

/** Formant filter / vowel morph: three cascaded peaking filters tuned to a vowel's formants. */
export class FormantModule implements EffectModule {
  readonly type = "formant" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly f1Filter: BiquadFilterNode;
  private readonly f2Filter: BiquadFilterNode;
  private readonly f3Filter: BiquadFilterNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.7;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const makeFormantFilter = () => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.Q.value = 8;
      filter.gain.value = 18;
      return filter;
    };
    this.f1Filter = makeFormantFilter();
    this.f2Filter = makeFormantFilter();
    this.f3Filter = makeFormantFilter();
    this.applyVowel("a");

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.f1Filter);
    this.f1Filter.connect(this.f2Filter);
    this.f2Filter.connect(this.f3Filter);
    this.f3Filter.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setVowel(vowel: VowelType) {
    this.applyVowel(vowel);
  }

  private applyVowel(vowel: VowelType) {
    const { f1, f2, f3 } = VOWEL_FORMANTS[vowel];
    ramp(this.ctx, this.f1Filter.frequency, f1);
    ramp(this.ctx, this.f2Filter.frequency, f2);
    ramp(this.ctx, this.f3Filter.frequency, f3);
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
    this.f1Filter.disconnect();
    this.f2Filter.disconnect();
    this.f3Filter.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

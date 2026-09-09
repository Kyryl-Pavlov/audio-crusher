import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Harmonizer: its own SoundTouch node fixed to a musical interval (default +12
 * semitones, an octave), mixed under the dry signal - unlike the plain Pitch Shift
 * module (a full replace), this is meant to layer a harmony/shimmer voice.
 */
export class HarmonizerModule implements EffectModule {
  readonly type = "harmonizer" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly stNode: SoundTouchNode;
  private readonly wetGain: GainNode;
  private readonly dryGain: GainNode;
  private enabled = false;
  private mix = 0.4;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.stNode = new SoundTouchNode({ context: ctx });
    this.stNode.pitchSemitones.value = 12;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;

    this.input.connect(this.dryGain);
    this.input.connect(this.stNode);
    this.stNode.connect(this.wetGain);
    this.wetGain.connect(this.output);
    this.dryGain.connect(this.output);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyMix();
  }

  setSemitones(semitones: number) {
    ramp(this.ctx, this.stNode.pitchSemitones, semitones);
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
    this.stNode.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
    this.output.disconnect();
  }
}

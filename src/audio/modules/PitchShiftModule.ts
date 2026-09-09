import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

/**
 * Independent semitone pitch shift, decoupled from playback tempo (unlike the
 * fixed transport Speed control, this never touches the source's playbackRate).
 * 0 semitones is already a no-op passthrough, so there's no enable/bypass toggle.
 */
export class PitchShiftModule implements EffectModule {
  readonly type = "pitch-shift" as const;
  readonly input: AudioNode;
  readonly output: AudioNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly stNode: SoundTouchNode;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    this.stNode = new SoundTouchNode({ context: ctx });
    this.input = this.stNode;
    this.output = this.stNode;
  }

  setSemitones(semitones: number) {
    ramp(this.ctx, this.stNode.pitchSemitones, semitones);
  }

  dispose() {
    this.stNode.disconnect();
  }
}

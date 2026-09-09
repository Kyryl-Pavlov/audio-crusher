import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import { ramp } from "../ramp";
import type { EffectModule } from "./types";

// Semitone swing at full depth — enough to be heard as tape/vinyl-style pitch
// instability without wandering audibly out of tune.
const WOW_FLUTTER_MAX_SEMITONES = 0.7;

/**
 * Tape/vinyl-style pitch wobble: an LFO modulates a dedicated SoundTouch node's
 * pitchSemitones around 0. Uses its own private SoundTouchNode so it never
 * interferes with any independent Pitch Shift module instances in the chain.
 */
export class WowFlutterModule implements EffectModule {
  readonly type = "wow-flutter" as const;
  readonly input: SoundTouchNode;
  readonly output: SoundTouchNode;

  readonly id: string;
  private readonly ctx: AudioContext;
  private readonly lfo: OscillatorNode;
  private readonly depthGain: GainNode;
  private enabled = false;
  private depth01 = 0.4;

  constructor(id: string, ctx: AudioContext) {
    this.id = id;
    this.ctx = ctx;
    const stNode = new SoundTouchNode({ context: ctx });
    this.input = stNode;
    this.output = stNode;

    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.6;
    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = 0;
    this.lfo.connect(this.depthGain);
    this.depthGain.connect(stNode.pitchSemitones);
    this.lfo.start();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    ramp(this.ctx, this.depthGain.gain, enabled ? this.depth01 * WOW_FLUTTER_MAX_SEMITONES : 0);
  }

  setRate(hz: number) {
    ramp(this.ctx, this.lfo.frequency, hz);
  }

  setDepth(amount01: number) {
    this.depth01 = amount01;
    if (this.enabled) ramp(this.ctx, this.depthGain.gain, amount01 * WOW_FLUTTER_MAX_SEMITONES);
  }

  dispose() {
    this.lfo.stop();
    this.lfo.disconnect();
    this.depthGain.disconnect();
    this.input.disconnect();
  }
}

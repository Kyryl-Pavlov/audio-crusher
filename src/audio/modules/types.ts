import type { DriveType } from "../distortionCurve";
import type { ReverbType, SwellLength, CabinetType } from "../impulseResponse";
import type { VinylIntensity } from "../vinylNoise";

export type VowelType = "a" | "e" | "i" | "o" | "u";

export type ModuleType =
  | "pitch-shift"
  | "drive"
  | "delay"
  | "reverb"
  | "auto-pan"
  | "wow-flutter"
  | "vinyl"
  | "chorus"
  | "flanger"
  | "phaser"
  | "tremolo"
  | "compressor"
  | "noise-gate"
  | "bitcrusher"
  | "ring-mod"
  | "stereo-widener"
  | "auto-wah"
  | "harmonizer"
  | "multiband-distortion"
  | "slapback"
  | "reverse-swell"
  | "freeze"
  | "telephone"
  | "sidechain"
  | "formant"
  | "stutter"
  | "cabinet"
  | "reverse-delay";

/**
 * A self-contained, chain-insertable effect instance. `input`/`output` are stable
 * node references so the chain manager can wire arbitrary sequences of modules with
 * plain `prev.output.connect(next.input)` calls, regardless of what's inside.
 */
export interface EffectModule {
  readonly id: string;
  readonly type: ModuleType;
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Stops any oscillators/sources owned by this instance and disconnects its nodes. */
  dispose(): void;
}

export type ModuleConfig =
  | { type: "pitch-shift"; semitones: number }
  | { type: "drive"; enabled: boolean; driveType: DriveType; amount: number; tone: number; mix: number }
  | { type: "delay"; enabled: boolean; time: number; feedback: number; mix: number }
  | { type: "reverb"; enabled: boolean; reverbType: ReverbType; mix: number }
  | { type: "auto-pan"; enabled: boolean; rate: number }
  | { type: "wow-flutter"; enabled: boolean; rate: number; depth: number }
  | { type: "vinyl"; enabled: boolean; intensity: VinylIntensity; amount: number }
  | { type: "chorus"; enabled: boolean; rate: number; depth: number; mix: number }
  | { type: "flanger"; enabled: boolean; rate: number; depth: number; feedback: number; mix: number }
  | { type: "phaser"; enabled: boolean; rate: number; depth: number; mix: number }
  | { type: "tremolo"; enabled: boolean; rate: number; depth: number }
  | { type: "compressor"; enabled: boolean; threshold: number; ratio: number; attack: number; release: number; mix: number }
  | { type: "noise-gate"; enabled: boolean; threshold: number; release: number }
  | { type: "bitcrusher"; enabled: boolean; bits: number; rateReduction: number; mix: number }
  | { type: "ring-mod"; enabled: boolean; frequency: number; mix: number }
  | { type: "stereo-widener"; width: number }
  | { type: "auto-wah"; enabled: boolean; sensitivity: number; baseFreq: number; mix: number }
  | { type: "harmonizer"; enabled: boolean; semitones: number; mix: number }
  | { type: "multiband-distortion"; enabled: boolean; low: number; mid: number; high: number; mix: number }
  | { type: "slapback"; enabled: boolean; time: number; mix: number }
  | { type: "reverse-swell"; enabled: boolean; length: SwellLength; mix: number }
  | { type: "freeze"; enabled: boolean; time: number }
  | { type: "telephone"; enabled: boolean; crunch: number; mix: number }
  | { type: "sidechain"; enabled: boolean; rate: number; depth: number }
  | { type: "formant"; enabled: boolean; vowel: VowelType; mix: number }
  | { type: "stutter"; enabled: boolean; window: number }
  | { type: "cabinet"; enabled: boolean; cabinetType: CabinetType; mix: number }
  | { type: "reverse-delay"; enabled: boolean; time: number; feedback: number; mix: number };

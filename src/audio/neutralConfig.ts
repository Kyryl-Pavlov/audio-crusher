import type { ModuleConfig, ModuleType } from "./modules/types";

// Effects added from the library start enabled (dragging one in is the "turn it on"
// action now), at the same neutral values the old fixed cards used to default to.
export const NEUTRAL_CONFIG: Record<ModuleType, ModuleConfig> = {
  "pitch-shift": { type: "pitch-shift", semitones: 0 },
  drive: { type: "drive", enabled: true, driveType: "overdrive", amount: 0.4, tone: 1, mix: 0.4 },
  delay: { type: "delay", enabled: true, time: 0.3, feedback: 0.3, mix: 0.25 },
  reverb: { type: "reverb", enabled: true, reverbType: "hall", mix: 0.35 },
  "auto-pan": { type: "auto-pan", enabled: true, rate: 0.2 },
  "wow-flutter": { type: "wow-flutter", enabled: true, rate: 0.6, depth: 0.4 },
  vinyl: { type: "vinyl", enabled: true, intensity: "medium", amount: 0.3 },
  chorus: { type: "chorus", enabled: true, rate: 0.8, depth: 3, mix: 0.35 },
  flanger: { type: "flanger", enabled: true, rate: 0.25, depth: 2, feedback: 0.5, mix: 0.5 },
  phaser: { type: "phaser", enabled: true, rate: 0.3, depth: 400, mix: 0.5 },
  tremolo: { type: "tremolo", enabled: true, rate: 5, depth: 0.5 },
  compressor: { type: "compressor", enabled: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.2, mix: 1 },
  "noise-gate": { type: "noise-gate", enabled: true, threshold: -40, release: 150 },
  bitcrusher: { type: "bitcrusher", enabled: true, bits: 8, rateReduction: 4, mix: 0.6 },
  "ring-mod": { type: "ring-mod", enabled: true, frequency: 200, mix: 0.7 },
  "stereo-widener": { type: "stereo-widener", width: 1.5 },
  "auto-wah": { type: "auto-wah", enabled: true, sensitivity: 0.6, baseFreq: 500, mix: 0.7 },
  harmonizer: { type: "harmonizer", enabled: true, semitones: 12, mix: 0.4 },
  "multiband-distortion": { type: "multiband-distortion", enabled: true, low: 0.3, mid: 0.3, high: 0.3, mix: 0.5 },
  slapback: { type: "slapback", enabled: true, time: 0.11, mix: 0.35 },
  "reverse-swell": { type: "reverse-swell", enabled: true, length: "medium", mix: 0.5 },
  freeze: { type: "freeze", enabled: false, time: 0.12 },
  telephone: { type: "telephone", enabled: true, crunch: 0.3, mix: 0.8 },
  sidechain: { type: "sidechain", enabled: true, rate: 2, depth: 0.6 },
  formant: { type: "formant", enabled: true, vowel: "a", mix: 0.7 },
  stutter: { type: "stutter", enabled: false, window: 100 },
  cabinet: { type: "cabinet", enabled: true, cabinetType: "small-speaker", mix: 0.6 },
  "reverse-delay": { type: "reverse-delay", enabled: true, time: 0.35, feedback: 0.35, mix: 0.4 },
};

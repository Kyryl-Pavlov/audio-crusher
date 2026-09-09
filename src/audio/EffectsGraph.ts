import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";
import noiseGateProcessorUrl from "./worklets/noiseGateProcessor.js?url";
import bitcrusherProcessorUrl from "./worklets/bitcrusherProcessor.js?url";
import stutterProcessorUrl from "./worklets/stutterProcessor.js?url";
import reverseDelayProcessorUrl from "./worklets/reverseDelayProcessor.js?url";
import { ramp } from "./ramp";
import { ModuleChain } from "./ModuleChain";
import { reverseAudioBuffer } from "./reverseBuffer";
import type { DriveType } from "./distortionCurve";
import type { ReverbType, SwellLength, CabinetType } from "./impulseResponse";
import type { VinylIntensity } from "./vinylNoise";
import type { EffectModule, ModuleType, VowelType } from "./modules/types";
import { PitchShiftModule } from "./modules/PitchShiftModule";
import { DriveModule } from "./modules/DriveModule";
import { DelayModule } from "./modules/DelayModule";
import { ReverbModule } from "./modules/ReverbModule";
import { AutoPanModule } from "./modules/AutoPanModule";
import { WowFlutterModule } from "./modules/WowFlutterModule";
import { VinylModule } from "./modules/VinylModule";
import { ChorusModule } from "./modules/ChorusModule";
import { FlangerModule } from "./modules/FlangerModule";
import { PhaserModule } from "./modules/PhaserModule";
import { TremoloModule } from "./modules/TremoloModule";
import { CompressorModule } from "./modules/CompressorModule";
import { NoiseGateModule } from "./modules/NoiseGateModule";
import { BitcrusherModule } from "./modules/BitcrusherModule";
import { RingModModule } from "./modules/RingModModule";
import { StereoWidenerModule } from "./modules/StereoWidenerModule";
import { AutoWahModule } from "./modules/AutoWahModule";
import { HarmonizerModule } from "./modules/HarmonizerModule";
import { MultibandDistortionModule } from "./modules/MultibandDistortionModule";
import { SlapbackModule } from "./modules/SlapbackModule";
import { ReverseSwellModule } from "./modules/ReverseSwellModule";
import { FreezeModule } from "./modules/FreezeModule";
import { TelephoneModule } from "./modules/TelephoneModule";
import { SidechainModule } from "./modules/SidechainModule";
import { FormantModule } from "./modules/FormantModule";
import { StutterModule } from "./modules/StutterModule";
import { CabinetModule } from "./modules/CabinetModule";
import { ReverseDelayModule } from "./modules/ReverseDelayModule";

const EQ_BANDS: { freq: number; type: BiquadFilterType }[] = [
  { freq: 60, type: "lowshelf" },
  { freq: 150, type: "peaking" },
  { freq: 400, type: "peaking" },
  { freq: 1000, type: "peaking" },
  { freq: 2500, type: "peaking" },
  { freq: 6000, type: "peaking" },
  { freq: 12000, type: "peaking" },
  { freq: 16000, type: "highshelf" },
];

const ANALYSER_FFT_SIZE = 8192;
// Native looping restarts the buffer sample-accurately, but if its start and end
// samples don't meet at a zero-crossing the seam is an audible discontinuity — heard
// as a click/spike every time the track loops back to the top. Ducking the signal to
// silence for a short window around each loop boundary (fading the tail out, then the
// new cycle in) turns that hard restart into a soft attack instead.
const LOOP_SEAM_ATTACK_SECONDS = 0.015;
const LOOP_SEAM_SCHEDULE_LOOKAHEAD_SECONDS = 1.5;
// Target roll-off for the low-/high-cut filters, in dB/octave. 48dB/octave (four
// cascaded 2-pole biquad stages at ~12dB/octave each) is a steep cut without being
// so extreme it invites numerical/coefficient artifacts at the frequency extremes.
const CUTOFF_SLOPE_DB_PER_OCTAVE = 48;
const CUTOFF_FILTER_STAGES = Math.ceil(CUTOFF_SLOPE_DB_PER_OCTAVE / 12);
// Reordering/adding/removing a chain module re-splices live audio connections, which
// can otherwise produce an audible click. Briefly ducking the master output around the
// rewire hides that topology-change transient.
const CHAIN_REWIRE_DUCK_SECONDS = 0.008;
// A seek can't just move the existing source's playhead — Web Audio buffer sources are
// start-once — so it stops the old one and starts a new one at the new offset. Each swap
// is a hard discontinuity in the waveform, inaudible as a one-off click but, scrubbed
// rapidly (a jog-wheel drag can trigger dozens a second), the clicks blur into a buzzy,
// bitcrushed-sounding artifact. Ducking around every swap, the same trick rewireChain()
// uses, turns each one into an inaudible micro-fade instead.
const SEEK_DUCK_SECONDS = 0.006;

export class EffectsGraph {
  readonly ctx: AudioContext;
  readonly eqFrequencies: readonly number[] = EQ_BANDS.map((b) => b.freq);

  private readonly lowCutFilters: BiquadFilterNode[];
  private readonly highCutFilters: BiquadFilterNode[];
  private readonly eqNodes: BiquadFilterNode[];
  private readonly preEqAnalyser: AnalyserNode;
  private readonly postEqAnalyser: AnalyserNode;
  readonly analyserBinCount: number;

  // Fixed transport-level time-stretch node: only one AudioBufferSourceNode can exist,
  // so tempo (Speed) can never be a multi-instance chain module — it lives here instead,
  // auto-compensating pitch for the tempo change unless linkPitchToSpeed is enabled.
  private readonly speedNode: SoundTouchNode;

  private readonly chainOutputGain: GainNode;
  private readonly moduleChain: ModuleChain;

  private readonly masterGain: GainNode;
  private masterVolume = 0.8;
  // Taps the final output (post-volume), for the Transport card's level meter.
  private readonly masterOutputAnalyser: AnalyserNode;
  readonly masterMeterSize: number;

  private readonly loopSeamGain: GainNode;
  /** Loop index (in units of buffer.duration) whose seam fade hasn't been scheduled yet. */
  private nextLoopSeamK = Infinity;

  private buffer: AudioBuffer | null = null;
  // Built lazily (and only once per loaded file) the first time reverse playback is
  // enabled, since Web Audio's AudioBufferSourceNode has no negative-playbackRate
  // option — playing backwards means actually handing it a time-reversed copy.
  private reversedBuffer: AudioBuffer | null = null;
  private reverseEnabled = false;
  private sourceNode: AudioBufferSourceNode | null = null;
  private rate = 1;
  private linkPitchToSpeed = false;
  private ctxTimeAtStart = 0;
  private bufferOffsetAtStart = 0;
  private playing = false;
  private loopEnabled = false;

  onEnded: (() => void) | null = null;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.speedNode = new SoundTouchNode({ context: ctx });

    this.lowCutFilters = Array.from({ length: CUTOFF_FILTER_STAGES }, () => {
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 20;
      filter.Q.value = 0.707;
      return filter;
    });

    this.highCutFilters = Array.from({ length: CUTOFF_FILTER_STAGES }, () => {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 20000;
      filter.Q.value = 0.707;
      return filter;
    });

    this.eqNodes = EQ_BANDS.map(({ freq, type }) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      if (type === "peaking") filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });

    this.preEqAnalyser = ctx.createAnalyser();
    this.preEqAnalyser.fftSize = ANALYSER_FFT_SIZE;
    this.preEqAnalyser.smoothingTimeConstant = 0.85;
    this.postEqAnalyser = ctx.createAnalyser();
    this.postEqAnalyser.fftSize = ANALYSER_FFT_SIZE;
    this.postEqAnalyser.smoothingTimeConstant = 0.85;
    this.analyserBinCount = this.preEqAnalyser.frequencyBinCount;

    this.chainOutputGain = ctx.createGain();
    this.moduleChain = new ModuleChain(ctx);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    this.masterOutputAnalyser = ctx.createAnalyser();
    this.masterOutputAnalyser.fftSize = 1024;
    this.masterMeterSize = this.masterOutputAnalyser.fftSize;

    this.loopSeamGain = ctx.createGain();
    this.loopSeamGain.gain.value = 1;

    this.wireGraph();
    this.rewireChain();
  }

  static async create(): Promise<EffectsGraph> {
    const ctx = new AudioContext();
    await SoundTouchNode.register(ctx, processorUrl);
    await Promise.all([
      ctx.audioWorklet.addModule(noiseGateProcessorUrl),
      ctx.audioWorklet.addModule(bitcrusherProcessorUrl),
      ctx.audioWorklet.addModule(stutterProcessorUrl),
      ctx.audioWorklet.addModule(reverseDelayProcessorUrl),
    ]);
    return new EffectsGraph(ctx);
  }

  private wireGraph() {
    for (let i = 0; i < this.lowCutFilters.length - 1; i++) {
      this.lowCutFilters[i].connect(this.lowCutFilters[i + 1]);
    }
    this.lowCutFilters[this.lowCutFilters.length - 1].connect(this.highCutFilters[0]);
    for (let i = 0; i < this.highCutFilters.length - 1; i++) {
      this.highCutFilters[i].connect(this.highCutFilters[i + 1]);
    }
    this.loopSeamGain.connect(this.lowCutFilters[0]);

    const cutoffOut = this.highCutFilters[this.highCutFilters.length - 1];
    cutoffOut.connect(this.preEqAnalyser);
    cutoffOut.connect(this.eqNodes[0]);

    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    const eqOut = this.eqNodes[this.eqNodes.length - 1];
    eqOut.connect(this.postEqAnalyser);
    eqOut.connect(this.speedNode);

    // this.speedNode -> [dynamic chain] -> this.chainOutputGain is wired by rewireChain().
    this.chainOutputGain.connect(this.masterGain);

    this.masterGain.connect(this.masterOutputAnalyser);
    this.masterGain.connect(this.ctx.destination);
  }

  // --- Effect chain (drag-and-drop plugin rack) -------------------------------------

  addModule(type: ModuleType, atIndex?: number): string {
    const id = this.moduleChain.add(type, atIndex);
    this.rewireChain();
    return id;
  }

  removeModule(id: string) {
    if (!this.moduleChain.remove(id)) return;
    this.rewireChain();
  }

  moveModule(id: string, newIndex: number) {
    if (!this.moduleChain.move(id, newIndex)) return;
    this.rewireChain();
  }

  getChainOrder(): { id: string; type: ModuleType }[] {
    return this.moduleChain.getOrder();
  }

  /** Re-splices the dynamic chain's inter-module connections in its current order. */
  private rewireChain() {
    const now = this.ctx.currentTime;
    const gain = this.masterGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(this.masterVolume, now);
    gain.linearRampToValueAtTime(0, now + CHAIN_REWIRE_DUCK_SECONDS);

    this.moduleChain.splice(this.speedNode, this.chainOutputGain);

    gain.linearRampToValueAtTime(this.masterVolume, now + CHAIN_REWIRE_DUCK_SECONDS * 2);
  }

  private getModule<T extends EffectModule>(id: string, type: ModuleType): T | undefined {
    return this.moduleChain.getModule<T>(id, type);
  }

  // --- Drive (overdrive / distortion) -----------------------------------------------

  setDriveEnabled(id: string, enabled: boolean) {
    this.getModule<DriveModule>(id, "drive")?.setEnabled(enabled);
  }

  setDriveType(id: string, type: DriveType) {
    this.getModule<DriveModule>(id, "drive")?.setType(type);
  }

  setDriveAmount(id: string, amount: number) {
    this.getModule<DriveModule>(id, "drive")?.setAmount(amount);
  }

  setDriveTone(id: string, hz: number) {
    this.getModule<DriveModule>(id, "drive")?.setTone(hz);
  }

  setDriveMix(id: string, mix: number) {
    this.getModule<DriveModule>(id, "drive")?.setMix(mix);
  }

  // --- Delay -------------------------------------------------------------------------

  setDelayEnabled(id: string, enabled: boolean) {
    this.getModule<DelayModule>(id, "delay")?.setEnabled(enabled);
  }

  setDelayTime(id: string, seconds: number) {
    this.getModule<DelayModule>(id, "delay")?.setTime(seconds);
  }

  setDelayFeedback(id: string, amount: number) {
    this.getModule<DelayModule>(id, "delay")?.setFeedback(amount);
  }

  setDelayMix(id: string, mix: number) {
    this.getModule<DelayModule>(id, "delay")?.setMix(mix);
  }

  // --- Reverb ------------------------------------------------------------------------

  setReverbEnabled(id: string, enabled: boolean) {
    this.getModule<ReverbModule>(id, "reverb")?.setEnabled(enabled);
  }

  setReverbType(id: string, type: ReverbType) {
    this.getModule<ReverbModule>(id, "reverb")?.setType(type);
  }

  setReverbMix(id: string, mix: number) {
    this.getModule<ReverbModule>(id, "reverb")?.setMix(mix);
  }

  // --- Auto-pan ------------------------------------------------------------------------

  setAutoPanEnabled(id: string, enabled: boolean) {
    this.getModule<AutoPanModule>(id, "auto-pan")?.setEnabled(enabled);
  }

  setAutoPanRate(id: string, hz: number) {
    this.getModule<AutoPanModule>(id, "auto-pan")?.setRate(hz);
  }

  // --- Wow & flutter (tape/vinyl pitch instability) -------------------------------------

  setWowFlutterEnabled(id: string, enabled: boolean) {
    this.getModule<WowFlutterModule>(id, "wow-flutter")?.setEnabled(enabled);
  }

  setWowFlutterRate(id: string, hz: number) {
    this.getModule<WowFlutterModule>(id, "wow-flutter")?.setRate(hz);
  }

  setWowFlutterDepth(id: string, amount01: number) {
    this.getModule<WowFlutterModule>(id, "wow-flutter")?.setDepth(amount01);
  }

  // --- Vinyl crackle overlay -------------------------------------------------------------

  setVinylEnabled(id: string, enabled: boolean) {
    this.getModule<VinylModule>(id, "vinyl")?.setEnabled(enabled);
  }

  setVinylAmount(id: string, amount: number) {
    this.getModule<VinylModule>(id, "vinyl")?.setAmount(amount);
  }

  setVinylIntensity(id: string, intensity: VinylIntensity) {
    this.getModule<VinylModule>(id, "vinyl")?.setIntensity(intensity);
  }

  // --- Pitch shift -------------------------------------------------------------------

  setPitchShiftSemitones(id: string, semitones: number) {
    this.getModule<PitchShiftModule>(id, "pitch-shift")?.setSemitones(semitones);
  }

  // --- Chorus ------------------------------------------------------------------------

  setChorusEnabled(id: string, enabled: boolean) {
    this.getModule<ChorusModule>(id, "chorus")?.setEnabled(enabled);
  }

  setChorusRate(id: string, hz: number) {
    this.getModule<ChorusModule>(id, "chorus")?.setRate(hz);
  }

  setChorusDepth(id: string, ms: number) {
    this.getModule<ChorusModule>(id, "chorus")?.setDepth(ms);
  }

  setChorusMix(id: string, mix: number) {
    this.getModule<ChorusModule>(id, "chorus")?.setMix(mix);
  }

  // --- Flanger -----------------------------------------------------------------------

  setFlangerEnabled(id: string, enabled: boolean) {
    this.getModule<FlangerModule>(id, "flanger")?.setEnabled(enabled);
  }

  setFlangerRate(id: string, hz: number) {
    this.getModule<FlangerModule>(id, "flanger")?.setRate(hz);
  }

  setFlangerDepth(id: string, ms: number) {
    this.getModule<FlangerModule>(id, "flanger")?.setDepth(ms);
  }

  setFlangerFeedback(id: string, amount: number) {
    this.getModule<FlangerModule>(id, "flanger")?.setFeedback(amount);
  }

  setFlangerMix(id: string, mix: number) {
    this.getModule<FlangerModule>(id, "flanger")?.setMix(mix);
  }

  // --- Phaser ------------------------------------------------------------------------

  setPhaserEnabled(id: string, enabled: boolean) {
    this.getModule<PhaserModule>(id, "phaser")?.setEnabled(enabled);
  }

  setPhaserRate(id: string, hz: number) {
    this.getModule<PhaserModule>(id, "phaser")?.setRate(hz);
  }

  setPhaserDepth(id: string, hzRange: number) {
    this.getModule<PhaserModule>(id, "phaser")?.setDepth(hzRange);
  }

  setPhaserMix(id: string, mix: number) {
    this.getModule<PhaserModule>(id, "phaser")?.setMix(mix);
  }

  // --- Tremolo -----------------------------------------------------------------------

  setTremoloEnabled(id: string, enabled: boolean) {
    this.getModule<TremoloModule>(id, "tremolo")?.setEnabled(enabled);
  }

  setTremoloRate(id: string, hz: number) {
    this.getModule<TremoloModule>(id, "tremolo")?.setRate(hz);
  }

  setTremoloDepth(id: string, amount01: number) {
    this.getModule<TremoloModule>(id, "tremolo")?.setDepth(amount01);
  }

  // --- Compressor --------------------------------------------------------------------

  setCompressorEnabled(id: string, enabled: boolean) {
    this.getModule<CompressorModule>(id, "compressor")?.setEnabled(enabled);
  }

  setCompressorThreshold(id: string, db: number) {
    this.getModule<CompressorModule>(id, "compressor")?.setThreshold(db);
  }

  setCompressorRatio(id: string, ratio: number) {
    this.getModule<CompressorModule>(id, "compressor")?.setRatio(ratio);
  }

  setCompressorAttack(id: string, seconds: number) {
    this.getModule<CompressorModule>(id, "compressor")?.setAttack(seconds);
  }

  setCompressorRelease(id: string, seconds: number) {
    this.getModule<CompressorModule>(id, "compressor")?.setRelease(seconds);
  }

  setCompressorMix(id: string, mix: number) {
    this.getModule<CompressorModule>(id, "compressor")?.setMix(mix);
  }

  // --- Noise gate --------------------------------------------------------------------

  setNoiseGateEnabled(id: string, enabled: boolean) {
    this.getModule<NoiseGateModule>(id, "noise-gate")?.setEnabled(enabled);
  }

  setNoiseGateThreshold(id: string, db: number) {
    this.getModule<NoiseGateModule>(id, "noise-gate")?.setThreshold(db);
  }

  setNoiseGateRelease(id: string, ms: number) {
    this.getModule<NoiseGateModule>(id, "noise-gate")?.setRelease(ms);
  }

  // --- Bitcrusher --------------------------------------------------------------------

  setBitcrusherEnabled(id: string, enabled: boolean) {
    this.getModule<BitcrusherModule>(id, "bitcrusher")?.setEnabled(enabled);
  }

  setBitcrusherBits(id: string, bits: number) {
    this.getModule<BitcrusherModule>(id, "bitcrusher")?.setBits(bits);
  }

  setBitcrusherRateReduction(id: string, steps: number) {
    this.getModule<BitcrusherModule>(id, "bitcrusher")?.setRateReduction(steps);
  }

  setBitcrusherMix(id: string, mix: number) {
    this.getModule<BitcrusherModule>(id, "bitcrusher")?.setMix(mix);
  }

  // --- Ring modulator ------------------------------------------------------------------

  setRingModEnabled(id: string, enabled: boolean) {
    this.getModule<RingModModule>(id, "ring-mod")?.setEnabled(enabled);
  }

  setRingModFrequency(id: string, hz: number) {
    this.getModule<RingModModule>(id, "ring-mod")?.setFrequency(hz);
  }

  setRingModMix(id: string, mix: number) {
    this.getModule<RingModModule>(id, "ring-mod")?.setMix(mix);
  }

  // --- Stereo widener ------------------------------------------------------------------

  setStereoWidenerWidth(id: string, width: number) {
    this.getModule<StereoWidenerModule>(id, "stereo-widener")?.setWidth(width);
  }

  // --- Auto-wah ------------------------------------------------------------------------

  setAutoWahEnabled(id: string, enabled: boolean) {
    this.getModule<AutoWahModule>(id, "auto-wah")?.setEnabled(enabled);
  }

  setAutoWahSensitivity(id: string, amount01: number) {
    this.getModule<AutoWahModule>(id, "auto-wah")?.setSensitivity(amount01);
  }

  setAutoWahBaseFreq(id: string, hz: number) {
    this.getModule<AutoWahModule>(id, "auto-wah")?.setBaseFreq(hz);
  }

  setAutoWahMix(id: string, mix: number) {
    this.getModule<AutoWahModule>(id, "auto-wah")?.setMix(mix);
  }

  // --- Harmonizer ----------------------------------------------------------------------

  setHarmonizerEnabled(id: string, enabled: boolean) {
    this.getModule<HarmonizerModule>(id, "harmonizer")?.setEnabled(enabled);
  }

  setHarmonizerSemitones(id: string, semitones: number) {
    this.getModule<HarmonizerModule>(id, "harmonizer")?.setSemitones(semitones);
  }

  setHarmonizerMix(id: string, mix: number) {
    this.getModule<HarmonizerModule>(id, "harmonizer")?.setMix(mix);
  }

  // --- Multiband distortion -------------------------------------------------------------

  setMultibandDistortionEnabled(id: string, enabled: boolean) {
    this.getModule<MultibandDistortionModule>(id, "multiband-distortion")?.setEnabled(enabled);
  }

  setMultibandDistortionLow(id: string, amount: number) {
    this.getModule<MultibandDistortionModule>(id, "multiband-distortion")?.setLow(amount);
  }

  setMultibandDistortionMid(id: string, amount: number) {
    this.getModule<MultibandDistortionModule>(id, "multiband-distortion")?.setMid(amount);
  }

  setMultibandDistortionHigh(id: string, amount: number) {
    this.getModule<MultibandDistortionModule>(id, "multiband-distortion")?.setHigh(amount);
  }

  setMultibandDistortionMix(id: string, mix: number) {
    this.getModule<MultibandDistortionModule>(id, "multiband-distortion")?.setMix(mix);
  }

  // --- Slapback delay --------------------------------------------------------------------

  setSlapbackEnabled(id: string, enabled: boolean) {
    this.getModule<SlapbackModule>(id, "slapback")?.setEnabled(enabled);
  }

  setSlapbackTime(id: string, seconds: number) {
    this.getModule<SlapbackModule>(id, "slapback")?.setTime(seconds);
  }

  setSlapbackMix(id: string, mix: number) {
    this.getModule<SlapbackModule>(id, "slapback")?.setMix(mix);
  }

  // --- Reverse swell -----------------------------------------------------------------------

  setReverseSwellEnabled(id: string, enabled: boolean) {
    this.getModule<ReverseSwellModule>(id, "reverse-swell")?.setEnabled(enabled);
  }

  setReverseSwellLength(id: string, length: SwellLength) {
    this.getModule<ReverseSwellModule>(id, "reverse-swell")?.setLength(length);
  }

  setReverseSwellMix(id: string, mix: number) {
    this.getModule<ReverseSwellModule>(id, "reverse-swell")?.setMix(mix);
  }

  // --- Freeze ------------------------------------------------------------------------------

  setFreezeEnabled(id: string, frozen: boolean) {
    this.getModule<FreezeModule>(id, "freeze")?.setEnabled(frozen);
  }

  setFreezeTime(id: string, seconds: number) {
    this.getModule<FreezeModule>(id, "freeze")?.setTime(seconds);
  }

  // --- Telephone filter --------------------------------------------------------------------

  setTelephoneEnabled(id: string, enabled: boolean) {
    this.getModule<TelephoneModule>(id, "telephone")?.setEnabled(enabled);
  }

  setTelephoneCrunch(id: string, amount: number) {
    this.getModule<TelephoneModule>(id, "telephone")?.setCrunch(amount);
  }

  setTelephoneMix(id: string, mix: number) {
    this.getModule<TelephoneModule>(id, "telephone")?.setMix(mix);
  }

  // --- Sidechain ducking -------------------------------------------------------------------

  setSidechainEnabled(id: string, enabled: boolean) {
    this.getModule<SidechainModule>(id, "sidechain")?.setEnabled(enabled);
  }

  setSidechainRate(id: string, hz: number) {
    this.getModule<SidechainModule>(id, "sidechain")?.setRate(hz);
  }

  setSidechainDepth(id: string, amount01: number) {
    this.getModule<SidechainModule>(id, "sidechain")?.setDepth(amount01);
  }

  // --- Formant filter ----------------------------------------------------------------------

  setFormantEnabled(id: string, enabled: boolean) {
    this.getModule<FormantModule>(id, "formant")?.setEnabled(enabled);
  }

  setFormantVowel(id: string, vowel: VowelType) {
    this.getModule<FormantModule>(id, "formant")?.setVowel(vowel);
  }

  setFormantMix(id: string, mix: number) {
    this.getModule<FormantModule>(id, "formant")?.setMix(mix);
  }

  // --- Granular stutter --------------------------------------------------------------------

  setStutterEnabled(id: string, active: boolean) {
    this.getModule<StutterModule>(id, "stutter")?.setEnabled(active);
  }

  setStutterWindow(id: string, ms: number) {
    this.getModule<StutterModule>(id, "stutter")?.setWindow(ms);
  }

  // --- Cabinet / speaker sim ----------------------------------------------------------------

  setCabinetEnabled(id: string, enabled: boolean) {
    this.getModule<CabinetModule>(id, "cabinet")?.setEnabled(enabled);
  }

  setCabinetType(id: string, type: CabinetType) {
    this.getModule<CabinetModule>(id, "cabinet")?.setCabinetType(type);
  }

  setCabinetMix(id: string, mix: number) {
    this.getModule<CabinetModule>(id, "cabinet")?.setMix(mix);
  }

  // --- Reverse delay -------------------------------------------------------------------

  setReverseDelayEnabled(id: string, enabled: boolean) {
    this.getModule<ReverseDelayModule>(id, "reverse-delay")?.setEnabled(enabled);
  }

  setReverseDelayTime(id: string, seconds: number) {
    this.getModule<ReverseDelayModule>(id, "reverse-delay")?.setTime(seconds);
  }

  setReverseDelayFeedback(id: string, amount: number) {
    this.getModule<ReverseDelayModule>(id, "reverse-delay")?.setFeedback(amount);
  }

  setReverseDelayMix(id: string, mix: number) {
    this.getModule<ReverseDelayModule>(id, "reverse-delay")?.setMix(mix);
  }

  // --- Source loading -----------------------------------------------------

  async loadFile(file: File): Promise<AudioBuffer> {
    return this.loadArrayBuffer(await file.arrayBuffer());
  }

  async loadArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.loadAudioBuffer(await this.ctx.decodeAudioData(arrayBuffer));
  }

  /** Adopts an already-decoded buffer as the current track — shared by file/array-buffer
   *  loading and by the tab-capture trim flow, which slices a buffer before handing it here. */
  loadAudioBuffer(audioBuffer: AudioBuffer): AudioBuffer {
    if (this.playing) this.pause();
    this.buffer = audioBuffer;
    this.reversedBuffer = null;
    this.reverseEnabled = false;
    this.bufferOffsetAtStart = 0;
    this.ctxTimeAtStart = 0;
    return audioBuffer;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get reverse(): boolean {
    return this.reverseEnabled;
  }

  /** The buffer actually handed to the source node: the original, or a reversed copy of it. */
  private getActiveBuffer(): AudioBuffer | null {
    if (!this.buffer) return null;
    if (!this.reverseEnabled) return this.buffer;
    if (!this.reversedBuffer) this.reversedBuffer = reverseAudioBuffer(this.ctx, this.buffer);
    return this.reversedBuffer;
  }

  /** Playback position within whichever buffer (forward or reversed) is currently active. */
  private getActiveBufferTime(): number {
    if (!this.buffer) return 0;
    if (!this.playing) return this.bufferOffsetAtStart;
    const elapsed = (this.ctx.currentTime - this.ctxTimeAtStart) * this.rate;
    const raw = this.bufferOffsetAtStart + elapsed;
    if (this.loopEnabled) return this.buffer.duration > 0 ? raw % this.buffer.duration : 0;
    return Math.min(this.buffer.duration, raw);
  }

  /** Track-relative playback time (0 at the track's start, duration at its end) regardless of play direction. */
  getCurrentTime(): number {
    if (!this.buffer) return 0;
    const raw = this.getActiveBufferTime();
    return this.reverseEnabled ? this.buffer.duration - raw : raw;
  }

  // --- Transport -----------------------------------------------------------

  /** Creates and starts a source at `this.bufferOffsetAtStart`, scheduled for audio-clock
   *  time `when` (immediately, or a few ms out when synced with a seek's mute envelope —
   *  see seek()). Becomes the new `sourceNode`/`ctxTimeAtStart` regardless of which. */
  private startSourceAt(when: number) {
    const buf = this.getActiveBuffer();
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.rate;
    src.loop = this.loopEnabled;
    src.connect(this.loopSeamGain);
    src.onended = () => {
      if (this.sourceNode !== src) return;
      this.sourceNode = null;
      this.playing = false;
      this.bufferOffsetAtStart = 0;
      this.ctxTimeAtStart = 0;
      this.onEnded?.();
    };

    src.start(when, this.bufferOffsetAtStart);
    this.sourceNode = src;
    this.ctxTimeAtStart = when;
    this.playing = true;
    this.resetLoopSeamSchedule();
  }

  play() {
    if (!this.getActiveBuffer() || this.playing) return;
    void this.ctx.resume();
    this.startSourceAt(this.ctx.currentTime);
  }

  pause() {
    if (!this.playing || !this.sourceNode) return;
    const pos = this.getActiveBufferTime();
    this.sourceNode.onended = null;
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.playing = false;
    this.bufferOffsetAtStart = pos;
  }

  get loop(): boolean {
    return this.loopEnabled;
  }

  setLoopEnabled(enabled: boolean) {
    this.loopEnabled = enabled;
    if (this.sourceNode) this.sourceNode.loop = enabled;
    if (this.playing) this.resetLoopSeamSchedule();
  }

  /** Re-anchors the loop-seam fade schedule to the current position/rate/loop state. */
  private resetLoopSeamSchedule() {
    const now = this.ctx.currentTime;
    this.loopSeamGain.gain.cancelScheduledValues(now);
    this.loopSeamGain.gain.setValueAtTime(1, now);
    this.nextLoopSeamK =
      this.loopEnabled && this.buffer && this.buffer.duration > 0
        ? Math.floor(this.bufferOffsetAtStart / this.buffer.duration) + 1
        : Infinity;
    this.scheduleLoopSeamFades();
  }

  // AudioParam automation has to be scheduled ahead of the moment it takes effect —
  // there's no "loop" event to react to at the seam itself — so this tops up the
  // schedule with every upcoming boundary within a short lookahead window. It's called
  // once from resetLoopSeamSchedule() and then repeatedly from maintainLoopSeam() as
  // playback continues, so long loop sessions keep getting new boundaries scheduled.
  private scheduleLoopSeamFades() {
    if (!this.buffer || this.nextLoopSeamK === Infinity) return;
    const duration = this.buffer.duration;
    const horizon = this.ctx.currentTime + LOOP_SEAM_SCHEDULE_LOOKAHEAD_SECONDS;
    const gain = this.loopSeamGain.gain;

    for (;;) {
      const boundaryTime = this.ctxTimeAtStart + (this.nextLoopSeamK * duration - this.bufferOffsetAtStart) / this.rate;
      if (boundaryTime > horizon) return;
      const fadeOutStart = Math.max(boundaryTime - LOOP_SEAM_ATTACK_SECONDS, this.ctx.currentTime);
      gain.setValueAtTime(1, fadeOutStart);
      gain.linearRampToValueAtTime(0, boundaryTime);
      gain.linearRampToValueAtTime(1, boundaryTime + LOOP_SEAM_ATTACK_SECONDS);
      this.nextLoopSeamK++;
    }
  }

  /** Called every animation frame while playing to keep the loop-seam schedule topped up. */
  maintainLoopSeam() {
    if (this.playing) this.scheduleLoopSeamFades();
  }

  seek(timeSec: number) {
    const clamped = Math.max(0, Math.min(timeSec, this.duration));
    const newOffset = this.reverseEnabled ? this.duration - clamped : clamped;

    if (this.playing && this.sourceNode) {
      // The swap itself can't happen "now" — it has to land exactly when the mute
      // envelope bottoms out, otherwise the old/new waveform discontinuity is still
      // audible at near-full volume. So the old source's stop and the new source's
      // start are both scheduled for that same future instant on the audio clock,
      // rather than performed immediately, with the gain dip sandwiched around it.
      const now = this.ctx.currentTime;
      const swapAt = now + SEEK_DUCK_SECONDS;
      const gain = this.masterGain.gain;
      // Anchor at the gain's actual live value, not this.masterVolume — a fast
      // spin re-seeks faster than one duck cycle takes to finish, so the previous
      // seek's fade is often still in flight. Forcing the value back to full here
      // would itself be a hard discontinuity, repeated on every seek; reading the
      // live value instead lets a new duck pick up smoothly wherever the last one
      // left off.
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, swapAt);
      gain.linearRampToValueAtTime(this.masterVolume, swapAt + SEEK_DUCK_SECONDS);

      const oldSource = this.sourceNode;
      const oldSourceStart = this.ctxTimeAtStart;
      oldSource.onended = () => oldSource.disconnect();
      oldSource.stop(Math.max(swapAt, oldSourceStart));

      this.bufferOffsetAtStart = newOffset;
      this.startSourceAt(swapAt);
    } else {
      this.bufferOffsetAtStart = newOffset;
      this.ctxTimeAtStart = this.ctx.currentTime;
    }
  }

  /** Toggles play direction, keeping playback anchored at the same point in the track. */
  setReverseEnabled(enabled: boolean) {
    if (this.reverseEnabled === enabled) return;
    const trackTime = this.getCurrentTime();
    this.reverseEnabled = enabled;
    this.seek(trackTime);
  }

  // --- Speed / pitch ---------------------------------------------------------

  setSpeed(rate: number) {
    if (this.playing) {
      this.bufferOffsetAtStart = this.getActiveBufferTime();
      this.ctxTimeAtStart = this.ctx.currentTime;
    }
    this.rate = rate;
    if (this.sourceNode) this.sourceNode.playbackRate.value = rate;
    ramp(this.ctx, this.speedNode.playbackRate, rate);
    this.syncLinkedPitch();
    // Changing rate changes the loop period, so every previously scheduled seam-fade
    // boundary is now wrong — rebase the schedule from the current position.
    if (this.playing) this.resetLoopSeamSchedule();
  }

  setLinkPitchToSpeed(linked: boolean) {
    this.linkPitchToSpeed = linked;
    this.syncLinkedPitch();
  }

  private syncLinkedPitch() {
    ramp(this.ctx, this.speedNode.pitch, this.linkPitchToSpeed ? this.rate : 1.0);
  }

  // --- Low-cut / high-cut filters ----------------------------------------------
  // Set directly rather than via ramp(): a slider drag fires 'input' on nearly every
  // frame, and repeatedly restarting an exponential ramp on a cascaded filter's
  // frequency causes a brief coefficient/state mismatch on every restart, audible as
  // a spike right at the cutoff (worse across all cascaded stages). Snapping the value
  // instead avoids that, and the UI's own tick rate already smooths the sweep.

  setLowCutFreq(hz: number) {
    const now = this.ctx.currentTime;
    this.lowCutFilters.forEach((filter) => {
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(hz, now);
    });
  }

  setHighCutFreq(hz: number) {
    const now = this.ctx.currentTime;
    this.highCutFilters.forEach((filter) => {
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(hz, now);
    });
  }

  // --- EQ --------------------------------------------------------------------

  setEqBandGain(index: number, gainDb: number) {
    const band = this.eqNodes[index];
    if (band) ramp(this.ctx, band.gain, gainDb);
  }

  readPreEqSpectrum(out: Uint8Array<ArrayBuffer>) {
    this.preEqAnalyser.getByteFrequencyData(out);
  }

  readPostEqSpectrum(out: Uint8Array<ArrayBuffer>) {
    this.postEqAnalyser.getByteFrequencyData(out);
  }

  // --- Master ------------------------------------------------------------------

  setMasterVolume(volume: number) {
    this.masterVolume = volume;
    ramp(this.ctx, this.masterGain.gain, volume);
  }

  /** Time-domain samples of the final output, for the Transport card's level meter. */
  readMasterOutputLevel(out: Float32Array<ArrayBuffer>) {
    this.masterOutputAnalyser.getFloatTimeDomainData(out);
  }
}

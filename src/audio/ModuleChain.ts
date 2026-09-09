import type { EffectModule, ModuleType } from "./modules/types";
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

/** Owns the drag-and-drop plugin rack: live module instances, their order, and the factory
 *  that creates them. Doesn't touch the master bus itself -- EffectsGraph calls splice()
 *  from inside its own duck-around-the-rewire envelope, so the audible side effect of a
 *  topology change stays owned by the caller. */
export class ModuleChain {
  private readonly ctx: AudioContext;
  private readonly modules = new Map<string, EffectModule>();
  private chain: EffectModule[] = [];
  private nextModuleId = 1;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  add(type: ModuleType, atIndex?: number): string {
    const id = `m${this.nextModuleId++}`;
    const instance = this.createModule(id, type);
    this.modules.set(id, instance);
    const index = atIndex ?? this.chain.length;
    this.chain.splice(Math.max(0, Math.min(index, this.chain.length)), 0, instance);
    return id;
  }

  /** Returns false (no-op) if `id` isn't in the chain. */
  remove(id: string): boolean {
    const index = this.chain.findIndex((m) => m.id === id);
    if (index === -1) return false;
    const [instance] = this.chain.splice(index, 1);
    this.modules.delete(id);
    instance.dispose();
    return true;
  }

  /** Returns false (no-op) if `id` isn't in the chain. */
  move(id: string, newIndex: number): boolean {
    const index = this.chain.findIndex((m) => m.id === id);
    if (index === -1) return false;
    const [instance] = this.chain.splice(index, 1);
    this.chain.splice(Math.max(0, Math.min(newIndex, this.chain.length)), 0, instance);
    return true;
  }

  getOrder(): { id: string; type: ModuleType }[] {
    return this.chain.map((m) => ({ id: m.id, type: m.type }));
  }

  getModule<T extends EffectModule>(id: string, type: ModuleType): T | undefined {
    const instance = this.modules.get(id);
    return instance && instance.type === type ? (instance as T) : undefined;
  }

  /** Re-splices the chain's inter-module connections, in current order, between `input` and `output`. */
  splice(input: AudioNode, output: AudioNode) {
    input.disconnect();
    this.chain.forEach((m) => m.output.disconnect());

    let prev: AudioNode = input;
    for (const m of this.chain) {
      prev.connect(m.input);
      prev = m.output;
    }
    prev.connect(output);
  }

  private createModule(id: string, type: ModuleType): EffectModule {
    switch (type) {
      case "pitch-shift":
        return new PitchShiftModule(id, this.ctx);
      case "drive":
        return new DriveModule(id, this.ctx);
      case "delay":
        return new DelayModule(id, this.ctx);
      case "reverb":
        return new ReverbModule(id, this.ctx);
      case "auto-pan":
        return new AutoPanModule(id, this.ctx);
      case "wow-flutter":
        return new WowFlutterModule(id, this.ctx);
      case "vinyl":
        return new VinylModule(id, this.ctx);
      case "chorus":
        return new ChorusModule(id, this.ctx);
      case "flanger":
        return new FlangerModule(id, this.ctx);
      case "phaser":
        return new PhaserModule(id, this.ctx);
      case "tremolo":
        return new TremoloModule(id, this.ctx);
      case "compressor":
        return new CompressorModule(id, this.ctx);
      case "noise-gate":
        return new NoiseGateModule(id, this.ctx);
      case "bitcrusher":
        return new BitcrusherModule(id, this.ctx);
      case "ring-mod":
        return new RingModModule(id, this.ctx);
      case "stereo-widener":
        return new StereoWidenerModule(id, this.ctx);
      case "auto-wah":
        return new AutoWahModule(id, this.ctx);
      case "harmonizer":
        return new HarmonizerModule(id, this.ctx);
      case "multiband-distortion":
        return new MultibandDistortionModule(id, this.ctx);
      case "slapback":
        return new SlapbackModule(id, this.ctx);
      case "reverse-swell":
        return new ReverseSwellModule(id, this.ctx);
      case "freeze":
        return new FreezeModule(id, this.ctx);
      case "telephone":
        return new TelephoneModule(id, this.ctx);
      case "sidechain":
        return new SidechainModule(id, this.ctx);
      case "formant":
        return new FormantModule(id, this.ctx);
      case "stutter":
        return new StutterModule(id, this.ctx);
      case "cabinet":
        return new CabinetModule(id, this.ctx);
      case "reverse-delay":
        return new ReverseDelayModule(id, this.ctx);
    }
  }
}

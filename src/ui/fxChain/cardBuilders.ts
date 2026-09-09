import type { EffectsGraph } from "../../audio/EffectsGraph";
import type { ModuleConfig } from "../../audio/modules/types";
import { createChainCardShellFactory } from "./cardShell";
import { createPitchTimeCardBuilders } from "./cards/pitchTimeCards";
import { createModulationCardBuilders } from "./cards/modulationCards";
import { createDynamicsCardBuilders } from "./cards/dynamicsCards";
import { createTextureCardBuilders } from "./cards/textureCards";
import { createSpaceTimeCardBuilders } from "./cards/spaceTimeCards";

/** Builds all per-module-type FX chain cards, bound to a single EffectsGraph instance. */
export function createCardBuilder(graph: EffectsGraph) {
  const createChainCardShell = createChainCardShellFactory(graph);

  const pitchTime = createPitchTimeCardBuilders(graph, createChainCardShell);
  const modulation = createModulationCardBuilders(graph, createChainCardShell);
  const dynamics = createDynamicsCardBuilders(graph, createChainCardShell);
  const texture = createTextureCardBuilders(graph, createChainCardShell);
  const spaceTime = createSpaceTimeCardBuilders(graph, createChainCardShell);

  function buildChainCard(id: string, cfg: ModuleConfig): HTMLElement {
    switch (cfg.type) {
      case "pitch-shift":
        return pitchTime.createPitchShiftCard(id, cfg);
      case "harmonizer":
        return pitchTime.createHarmonizerCard(id, cfg);
      case "stereo-widener":
        return pitchTime.createStereoWidenerCard(id, cfg);
      case "auto-pan":
        return modulation.createAutoPanCard(id, cfg);
      case "wow-flutter":
        return modulation.createWowFlutterCard(id, cfg);
      case "chorus":
        return modulation.createChorusCard(id, cfg);
      case "flanger":
        return modulation.createFlangerCard(id, cfg);
      case "phaser":
        return modulation.createPhaserCard(id, cfg);
      case "tremolo":
        return modulation.createTremoloCard(id, cfg);
      case "compressor":
        return dynamics.createCompressorCard(id, cfg);
      case "noise-gate":
        return dynamics.createNoiseGateCard(id, cfg);
      case "sidechain":
        return dynamics.createSidechainCard(id, cfg);
      case "auto-wah":
        return dynamics.createAutoWahCard(id, cfg);
      case "drive":
        return texture.createDriveCard(id, cfg);
      case "bitcrusher":
        return texture.createBitcrusherCard(id, cfg);
      case "ring-mod":
        return texture.createRingModCard(id, cfg);
      case "multiband-distortion":
        return texture.createMultibandDistortionCard(id, cfg);
      case "telephone":
        return texture.createTelephoneCard(id, cfg);
      case "cabinet":
        return texture.createCabinetCard(id, cfg);
      case "formant":
        return texture.createFormantCard(id, cfg);
      case "vinyl":
        return texture.createVinylCard(id, cfg);
      case "delay":
        return spaceTime.createDelayCard(id, cfg);
      case "reverb":
        return spaceTime.createReverbCard(id, cfg);
      case "slapback":
        return spaceTime.createSlapbackCard(id, cfg);
      case "reverse-swell":
        return spaceTime.createReverseSwellCard(id, cfg);
      case "reverse-delay":
        return spaceTime.createReverseDelayCard(id, cfg);
      case "freeze":
        return spaceTime.createFreezeCard(id, cfg);
      case "stutter":
        return spaceTime.createStutterCard(id, cfg);
    }
  }

  return { buildChainCard };
}

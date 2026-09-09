import type { ModuleConfig } from "../audio/modules/types";
import { LOW_CUT_MIN, HIGH_CUT_MAX, DRIVE_TONE_MIN, DRIVE_TONE_MAX, freqToSlider } from "../audio/ranges";
import type { EqController } from "./eq";
import type { FxChainRack } from "./fxChain/rack";
import type { Transport } from "./transport";

interface Preset {
  speed: number;
  linkPitch: boolean;
  lowCut: number;
  highCut: number;
  /** Only the modules this preset actually uses, in chain order. */
  chain: ModuleConfig[];
}

interface CustomPreset extends Preset {
  id: string;
  name: string;
}

const CUSTOM_PRESETS_KEY = "audio-crusher:custom-presets";

function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? (JSON.parse(raw) as CustomPreset[]) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — preset still applies
    // this session, it just won't survive a reload.
  }
}

const PRESETS: Record<string, Preset> = {
  "slowed-reverb": {
    speed: 0.8,
    linkPitch: true,
    lowCut: LOW_CUT_MIN,
    highCut: HIGH_CUT_MAX,
    chain: [
      { type: "reverb", enabled: true, reverbType: "hall", mix: 0.45 },
      { type: "vinyl", enabled: true, intensity: "medium", amount: 0.3 },
    ],
  },
  nightcore: {
    speed: 1.25,
    linkPitch: true,
    lowCut: LOW_CUT_MIN,
    highCut: HIGH_CUT_MAX,
    chain: [],
  },
  "8d": {
    speed: 1.0,
    linkPitch: false,
    lowCut: LOW_CUT_MIN,
    highCut: HIGH_CUT_MAX,
    chain: [
      { type: "reverb", enabled: true, reverbType: "cathedral", mix: 0.25 },
      { type: "auto-pan", enabled: true, rate: 0.15 },
    ],
  },
  lofi: {
    speed: 0.97,
    linkPitch: false,
    lowCut: LOW_CUT_MIN,
    highCut: 15000,
    chain: [
      {
        type: "drive",
        enabled: true,
        driveType: "overdrive",
        amount: 0.3,
        tone: freqToSlider(4000, DRIVE_TONE_MIN, DRIVE_TONE_MAX),
        mix: 0.25,
      },
      { type: "reverb", enabled: true, reverbType: "room", mix: 0.18 },
      { type: "wow-flutter", enabled: true, rate: 0.6, depth: 0.4 },
      { type: "vinyl", enabled: true, intensity: "medium", amount: 0.4 },
    ],
  },
  "bass-boost": {
    speed: 1.0,
    linkPitch: false,
    lowCut: LOW_CUT_MIN,
    highCut: HIGH_CUT_MAX,
    chain: [],
  },
  vaporwave: {
    speed: 0.78,
    linkPitch: true,
    lowCut: LOW_CUT_MIN,
    highCut: 12000,
    chain: [
      { type: "reverb", enabled: true, reverbType: "hall", mix: 0.4 },
      { type: "wow-flutter", enabled: true, rate: 0.3, depth: 0.25 },
      { type: "vinyl", enabled: true, intensity: "light", amount: 0.2 },
    ],
  },
  telephone: {
    speed: 1.0,
    linkPitch: false,
    lowCut: 300,
    highCut: 3400,
    chain: [
      {
        type: "drive",
        enabled: true,
        driveType: "distortion",
        amount: 0.25,
        tone: freqToSlider(3000, DRIVE_TONE_MIN, DRIVE_TONE_MAX),
        mix: 0.3,
      },
    ],
  },
  underwater: {
    speed: 0.9,
    linkPitch: true,
    lowCut: LOW_CUT_MIN,
    highCut: 600,
    chain: [
      { type: "delay", enabled: true, time: 0.15, feedback: 0.25, mix: 0.2 },
      { type: "reverb", enabled: true, reverbType: "cathedral", mix: 0.3 },
      { type: "auto-pan", enabled: true, rate: 0.1 },
      { type: "wow-flutter", enabled: true, rate: 0.15, depth: 0.5 },
    ],
  },
  reset: {
    speed: 1.0,
    linkPitch: false,
    lowCut: LOW_CUT_MIN,
    highCut: HIGH_CUT_MAX,
    chain: [],
  },
};

/** Wires the preset buttons, applying each preset's speed/cutoffs/FX chain in one shot. */
export function createPresetsController(transport: Transport, eq: EqController, rack: FxChainRack): void {
  function applyPreset(preset: Preset) {
    transport.setSpeed(preset.speed);
    transport.setLinkPitch(preset.linkPitch);

    eq.reset();
    eq.setCutoffs(preset.lowCut, preset.highCut);

    rack.clear();
    preset.chain.forEach((cfg) => rack.appendModule(cfg.type, cfg));
  }

  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-preset]");
  const customPresetList = document.querySelector<HTMLDivElement>("#custom-preset-buttons");
  const savePresetBtn = document.querySelector<HTMLButtonElement>("#save-preset-btn");

  /** Clears .active from every preset button (built-in and custom) except the one just clicked. */
  function setActive(btn: HTMLButtonElement) {
    buttons.forEach((b) => b.classList.toggle("active", b === btn));
    customPresetList?.querySelectorAll<HTMLButtonElement>("[data-custom-preset]").forEach((b) => b.classList.toggle("active", b === btn));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = PRESETS[btn.dataset.preset ?? ""];
      if (!preset) return;

      applyPreset(preset);
      setActive(btn);
    });
  });

  let customPresets = loadCustomPresets();

  function renderCustomPreset(entry: CustomPreset) {
    if (!customPresetList) return;

    const chip = document.createElement("span");
    chip.className = "custom-preset-chip";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.customPreset = entry.id;
    btn.textContent = entry.name;
    btn.addEventListener("click", () => {
      applyPreset(entry);
      setActive(btn);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "remove-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", `Delete preset "${entry.name}"`);
    deleteBtn.addEventListener("click", () => {
      customPresets = customPresets.filter((p) => p.id !== entry.id);
      saveCustomPresets(customPresets);
      chip.remove();
      customPresetList.hidden = customPresets.length === 0;
    });

    chip.append(btn, deleteBtn);
    customPresetList.appendChild(chip);
  }

  if (customPresetList) {
    customPresetList.hidden = customPresets.length === 0;
    customPresets.forEach(renderCustomPreset);
  }

  savePresetBtn?.addEventListener("click", () => {
    const name = window.prompt(
      "Name this preset:\n\nSaved in this browser's local storage only — no cookies, nothing sent anywhere.",
    )?.trim();
    if (!name) return;

    const entry: CustomPreset = {
      id: `custom-${Date.now()}`,
      name,
      speed: transport.getSpeed(),
      linkPitch: transport.getLinkPitch(),
      lowCut: eq.getLowCutHz(),
      highCut: eq.getHighCutHz(),
      chain: rack.getChainConfig(),
    };

    customPresets.push(entry);
    saveCustomPresets(customPresets);
    if (customPresetList) customPresetList.hidden = false;
    renderCustomPreset(entry);
    const newBtn = document.querySelector<HTMLButtonElement>(`[data-custom-preset="${entry.id}"]`);
    if (newBtn) setActive(newBtn);
  });
}

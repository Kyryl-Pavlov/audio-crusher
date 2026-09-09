import type { EffectsGraph } from "../../audio/EffectsGraph";
import type { ModuleConfig, ModuleType } from "../../audio/modules/types";
import { NEUTRAL_CONFIG } from "../../audio/neutralConfig";
import { $ } from "../../utils/dom";
import { MODULE_META, MODULE_TYPES } from "../moduleMeta";
import { attachTooltip } from "../tooltip";
import { createCardBuilder } from "./cardBuilders";
import { MODULE_TYPE_DATA_ATTR, INSTANCE_ID_DATA_ATTR } from "./dragTypes";

export interface FxChainRack {
  /** Appends a module of the given type/config to the end of the chain. */
  appendModule(type: ModuleType, cfg: ModuleConfig): string;
  /** Removes every module from both the audio graph and the DOM. */
  clear(): void;
  /** Snapshot of the current chain's module configs, in order — used to save a custom preset. */
  getChainConfig(): ModuleConfig[];
}

/** Wires the FX chain drag-and-drop rack and the plugin library sidebar it accepts drops from. */
export function createFxChainRack(graph: EffectsGraph): FxChainRack {
  const { buildChainCard } = createCardBuilder(graph);

  const fxChainList = $<HTMLDivElement>("fx-chain-list");
  const libraryList = $<HTMLDivElement>("library-list");
  let dropIndicator: HTMLDivElement | null = null;
  // Each card mutates its own cfg object in place as its controls change (see the
  // card builders), so this map of live references always reflects current state —
  // no separate sync step needed to read it back out for a preset snapshot.
  const configs = new Map<string, ModuleConfig>();

  function chainCards(): HTMLElement[] {
    return Array.from(fxChainList.querySelectorAll<HTMLElement>(":scope > .chain-card"));
  }

  function computeDropIndex(clientY: number): number {
    const cards = chainCards();
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  function showDropIndicatorAt(index: number) {
    if (!dropIndicator) {
      dropIndicator = document.createElement("div");
      dropIndicator.className = "drop-indicator";
    }
    const refNode = chainCards()[index] ?? null;
    if (dropIndicator.nextSibling !== refNode || dropIndicator.parentElement !== fxChainList) {
      fxChainList.insertBefore(dropIndicator, refNode);
    }
  }

  function hideDropIndicator() {
    dropIndicator?.remove();
  }

  /** Creates a new module instance at `index` in both the audio graph and the DOM. */
  function instantiateModule(type: ModuleType, index: number, cfg: ModuleConfig): string {
    const id = graph.addModule(type, index);
    configs.set(id, cfg);
    const card = buildChainCard(id, cfg);
    const refNode = chainCards()[index] ?? null;
    fxChainList.insertBefore(card, refNode);
    return id;
  }

  fxChainList.addEventListener("dragover", (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes(MODULE_TYPE_DATA_ATTR) && !types.includes(INSTANCE_ID_DATA_ATTR)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = types.includes(MODULE_TYPE_DATA_ATTR) ? "copy" : "move";
    fxChainList.classList.add("drag-over");
    showDropIndicatorAt(computeDropIndex(e.clientY));
  });

  fxChainList.addEventListener("dragleave", (e) => {
    if (e.target === fxChainList) {
      fxChainList.classList.remove("drag-over");
      hideDropIndicator();
    }
  });

  fxChainList.addEventListener("drop", (e) => {
    const moduleType = e.dataTransfer?.getData(MODULE_TYPE_DATA_ATTR);
    const instanceId = e.dataTransfer?.getData(INSTANCE_ID_DATA_ATTR);
    if (!moduleType && !instanceId) return;
    e.preventDefault();
    const index = computeDropIndex(e.clientY);
    fxChainList.classList.remove("drag-over");
    hideDropIndicator();

    if (moduleType) {
      instantiateModule(moduleType as ModuleType, index, NEUTRAL_CONFIG[moduleType as ModuleType]);
    } else if (instanceId) {
      const card = fxChainList.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
      const refCard = chainCards()[index] ?? null;
      if (card && refCard !== card) fxChainList.insertBefore(card, refCard);
      graph.moveModule(instanceId, index);
    }
  });

  MODULE_TYPES.forEach((type) => {
    const meta = MODULE_META[type];
    const chip = document.createElement("div");
    chip.className = "library-chip";
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.style.setProperty("--chip-accent", meta.accent);
    chip.dataset.moduleType = type;

    const icon = document.createElement("span");
    icon.className = "library-chip-icon";
    icon.textContent = meta.icon;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "library-chip-label";
    label.textContent = meta.label;

    chip.append(icon, label);
    attachTooltip(chip, { title: meta.label, description: meta.description, howTo: meta.howTo });

    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData(MODULE_TYPE_DATA_ATTR, type);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));

    const appendToEnd = () => instantiateModule(type, chainCards().length, NEUTRAL_CONFIG[type]);
    chip.addEventListener("click", appendToEnd);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        appendToEnd();
      }
    });

    libraryList.appendChild(chip);
  });

  return {
    appendModule: (type, cfg) => instantiateModule(type, chainCards().length, cfg),
    clear: () => {
      graph.getChainOrder().forEach(({ id }) => graph.removeModule(id));
      fxChainList.replaceChildren();
    },
    getChainConfig: () =>
      chainCards()
        .map((card) => configs.get(card.dataset.instanceId ?? ""))
        .filter((cfg): cfg is ModuleConfig => cfg !== undefined)
        .map((cfg) => structuredClone(cfg)),
  };
}

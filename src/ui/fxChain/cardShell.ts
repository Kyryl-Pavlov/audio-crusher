import type { EffectsGraph } from "../../audio/EffectsGraph";
import type { ModuleConfig, ModuleType } from "../../audio/modules/types";
import { MODULE_META } from "../moduleMeta";
import { attachTooltip } from "../tooltip";
import { INSTANCE_ID_DATA_ATTR } from "./dragTypes";

export type Cfg<T extends ModuleType> = Extract<ModuleConfig, { type: T }>;

export type CreateChainCardShell = (
  id: string,
  type: ModuleType,
  withEnabled: boolean,
) => { card: HTMLDivElement; body: HTMLDivElement; ledInput: HTMLInputElement | null };

/** Builds the shared chrome (title bar, drag handle, LED toggle, remove button) every FX chain card starts from. */
export function createChainCardShellFactory(graph: EffectsGraph): CreateChainCardShell {
  function createChainCardShell(
    id: string,
    type: ModuleType,
    withEnabled: boolean,
  ): { card: HTMLDivElement; body: HTMLDivElement; ledInput: HTMLInputElement | null } {
    const meta = MODULE_META[type];
    const card = document.createElement("div");
    card.className = "card effect-card chain-card";
    card.dataset.instanceId = id;
    card.style.setProperty("--chip-accent", meta.accent);

    const titleBar = document.createElement("div");
    titleBar.className = "title-bar";

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.draggable = true;
    dragHandle.setAttribute("aria-label", "Drag to reorder");

    const icon = document.createElement("span");
    icon.className = "title-bar-icon";
    icon.textContent = meta.icon;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "title-bar-text";
    label.textContent = meta.label.toUpperCase();

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "info-btn";
    infoBtn.textContent = "?";
    infoBtn.setAttribute("aria-label", `About ${meta.label}`);
    attachTooltip(infoBtn, { title: meta.label, description: meta.description, howTo: meta.howTo });

    let ledInput: HTMLInputElement | null = null;
    let ledToggle: HTMLLabelElement | null = null;
    if (withEnabled) {
      ledToggle = document.createElement("label");
      ledToggle.className = "led-toggle";
      ledToggle.title = `Enable ${meta.label}`;
      ledInput = document.createElement("input");
      ledInput.type = "checkbox";
      const led = document.createElement("span");
      led.className = "led";
      led.setAttribute("aria-hidden", "true");
      ledToggle.append(ledInput, led);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove ${meta.label}`);
    removeBtn.addEventListener("click", () => {
      graph.removeModule(id);
      card.remove();
    });

    titleBar.append(dragHandle, icon, label);
    if (ledToggle) titleBar.append(ledToggle);
    titleBar.append(infoBtn, removeBtn);

    dragHandle.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData(INSTANCE_ID_DATA_ATTR, id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    dragHandle.addEventListener("dragend", () => card.classList.remove("dragging"));

    const body = document.createElement("div");
    body.className = "card-body";

    card.append(titleBar, body);

    return { card, body, ledInput };
  }

  return createChainCardShell;
}

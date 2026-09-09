import type { EffectsGraph } from "../audio/EffectsGraph";
import { $ } from "../utils/dom";

/** Wires the file picker and drag-and-drop zone, decoding dropped/chosen files via the graph. */
export function createFileLoader(graph: EffectsGraph, onLoaded: (buffer: AudioBuffer, label: string) => void): void {
  const fileInput = $<HTMLInputElement>("file-input");
  const fileDrop = $<HTMLLabelElement>("file-drop");
  const fileDropLabel = $<HTMLSpanElement>("file-drop-label");

  async function loadFile(file: File) {
    fileDropLabel.textContent = "Decoding…";
    try {
      const buffer = await graph.loadFile(file);
      onLoaded(buffer, file.name);
      fileDropLabel.textContent = "Choose a different file, or drag one here";
    } catch (err) {
      console.error(err);
      fileDropLabel.textContent = "Could not decode that file — try another.";
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
  });

  fileDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDrop.classList.add("dragover");
  });
  fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("dragover"));
  fileDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDrop.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
}

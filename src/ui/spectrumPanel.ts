import type { EffectsGraph } from "../audio/EffectsGraph";
import { $ } from "../utils/dom";
import { SpectrumView } from "./spectrumView";

export interface SpectrumPanel {
  tick(): void;
}

/** Wires the pre/post-EQ spectrum canvas, drawing the current low/high cutoffs on top of it. */
export function createSpectrumPanel(graph: EffectsGraph, getLowCutHz: () => number, getHighCutHz: () => number): SpectrumPanel {
  const spectrumCanvas = $<HTMLCanvasElement>("spectrum-canvas");
  const spectrumView = new SpectrumView(spectrumCanvas, graph.ctx.sampleRate, graph.analyserBinCount, graph.eqFrequencies);
  const preSpectrum = new Uint8Array(graph.analyserBinCount);
  const postSpectrum = new Uint8Array(graph.analyserBinCount);

  return {
    tick() {
      graph.readPreEqSpectrum(preSpectrum);
      graph.readPostEqSpectrum(postSpectrum);
      spectrumView.draw(preSpectrum, postSpectrum, getLowCutHz(), getHighCutHz());
    },
  };
}

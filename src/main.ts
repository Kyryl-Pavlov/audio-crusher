import "./style.css";
import { EffectsGraph } from "./audio/EffectsGraph";
import { $ } from "./utils/dom";
import { createTransport } from "./ui/transport";
import { createEqController } from "./ui/eq";
import { createSpectrumPanel } from "./ui/spectrumPanel";
import { createSlicerPanel } from "./ui/slicerPanel";
import { createFxChainRack } from "./ui/fxChain/rack";
import { createPresetsController } from "./ui/presets";
import { createFileLoader } from "./ui/fileLoading";
import { createTabCapturePanel } from "./ui/tabCapturePanel";

async function main() {
  const graph = await EffectsGraph.create();

  const trackInfo = $<HTMLDivElement>("track-info");
  const trackName = $<HTMLElement>("track-name");

  const transport = createTransport(graph);
  const eq = createEqController(graph);
  const spectrumPanel = createSpectrumPanel(graph, eq.getLowCutHz, eq.getHighCutHz);
  const slicerPanel = createSlicerPanel(graph, transport);
  const rack = createFxChainRack(graph);

  /** Shared UI update for a freshly loaded track, regardless of whether it came from
   *  a dropped file or a tab-audio capture. */
  function onTrackLoaded(buffer: AudioBuffer, label: string) {
    trackName.textContent = label;
    trackInfo.hidden = false;
    transport.onTrackLoaded(buffer);
    slicerPanel.load(buffer);
  }

  createFileLoader(graph, onTrackLoaded);
  createTabCapturePanel(graph, onTrackLoaded);
  createPresetsController(transport, eq, rack);

  function tick() {
    graph.maintainLoopSeam();
    transport.tick();
    eq.tick();
    slicerPanel.tick();
    spectrumPanel.tick();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

main();

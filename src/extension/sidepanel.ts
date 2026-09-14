import "../style.css";
import { EffectsGraph } from "../audio/EffectsGraph";
import { createTransport } from "../ui/transport";
import { createEqController } from "../ui/eq";
import { createSpectrumPanel } from "../ui/spectrumPanel";
import { createFxChainRack } from "../ui/fxChain/rack";
import { createPresetsController } from "../ui/presets";
import { createLiveStreamPanel } from "../ui/liveStreamPanel";

async function main() {
  const graph = await EffectsGraph.create();

  const transport = createTransport(graph);
  const eq = createEqController(graph);
  const spectrumPanel = createSpectrumPanel(graph, eq.getLowCutHz, eq.getHighCutHz);
  const rack = createFxChainRack(graph);

  createLiveStreamPanel(graph, transport);
  createPresetsController(transport, eq, rack);

  function tick() {
    graph.maintainLoopSeam();
    transport.tick();
    eq.tick();
    spectrumPanel.tick();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

main();

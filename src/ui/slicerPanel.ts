import type { EffectsGraph } from "../audio/EffectsGraph";
import { $ } from "../utils/dom";
import type { Transport } from "./transport";
import { SlicerView } from "./slicerView";

export interface SlicerPanel {
  /** Reveals the slicer and loads a freshly loaded track's waveform/marks into it. */
  load(buffer: AudioBuffer): void;
  tick(): void;
}

/** Wires the hot-cue slicer: waveform, marks list, and seek-to-cue playback. */
export function createSlicerPanel(graph: EffectsGraph, transport: Transport): SlicerPanel {
  const slicerEmptyHint = $<HTMLParagraphElement>("slicer-empty-hint");
  const slicerWaveformWrap = $<HTMLDivElement>("slicer-waveform-wrap");
  const slicerMarkList = $<HTMLDivElement>("slicer-mark-list");
  const slicer = new SlicerView($<HTMLCanvasElement>("slicer-canvas"), slicerMarkList);
  slicer.onSeek = (timeSec) => {
    graph.seek(timeSec);
    transport.ensurePlaying();
  };

  return {
    load(buffer) {
      slicerEmptyHint.hidden = true;
      slicerWaveformWrap.hidden = false;
      slicerMarkList.hidden = false;
      slicer.setBuffer(buffer);
    },
    tick() {
      slicer.setPlayhead(graph.getCurrentTime());
    },
  };
}

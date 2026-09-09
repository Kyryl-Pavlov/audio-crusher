import type { EffectsGraph } from "../audio/EffectsGraph";
import { LOW_CUT_MIN, LOW_CUT_MAX, HIGH_CUT_MIN, HIGH_CUT_MAX, sliderToFreq, freqToSlider } from "../audio/ranges";
import { $ } from "../utils/dom";
import { fmtSigned, formatFreq, fmtCutoffFreq } from "../utils/format";

export interface EqController {
  /** Applies any cutoff-slider drag pending since the last frame (coalesced to one graph update per frame). */
  tick(): void;
  getLowCutHz(): number;
  getHighCutHz(): number;
  /** Immediately sets both cutoffs (slider position, graph filters, band availability), ducking
   *  by -15dB whichever bands straddle a cutoff that's actually engaged (off its fully-open
   *  bound) — used by presets. */
  setCutoffs(lowHz: number, highHz: number): void;
  /** Resets band gains to 0dB and clears any in-progress cutoff duck — used by presets. */
  reset(): void;
}

/** Wires the EQ band sliders and the low/high cutoff knobs that gate which bands are active. */
export function createEqController(graph: EffectsGraph): EqController {
  const eqBandsContainer = $<HTMLDivElement>("eq-bands");
  const eqResetBtn = $<HTMLButtonElement>("eq-reset-btn");

  const lowCut = $<HTMLInputElement>("low-cut");
  const lowCutValue = $<HTMLSpanElement>("low-cut-value");
  const highCut = $<HTMLInputElement>("high-cut");
  const highCutValue = $<HTMLSpanElement>("high-cut-value");
  let lowCutHz = LOW_CUT_MIN;
  let highCutHz = HIGH_CUT_MAX;
  // Slider drags can fire 'input' faster than once per frame; each call snaps the
  // cutoff filters' coefficients, and a cascade of 13 stages has that many chances
  // to produce an audible transient. Coalescing to one graph update per animation
  // frame (applied from tick()) cuts how often that happens without any perceptible
  // loss of responsiveness.
  let pendingLowCutHz: number | null = null;
  let pendingHighCutHz: number | null = null;

  const eqBandInputs: HTMLInputElement[] = [];
  const eqBandEls: HTMLDivElement[] = [];
  const eqGainLabels: HTMLSpanElement[] = [];
  // The gain the user actually dialed in for each band, independent of any cutoff-duck
  // dip currently applied on top of it — ducking always dips from this, never from the
  // currently-displayed (possibly already-ducked) value, so repeated drags don't compound.
  const eqBandBaselineDb: number[] = [];

  function updateEqBandAvailability() {
    graph.eqFrequencies.forEach((freq, i) => {
      const outOfRange = freq < lowCutHz || freq > highCutHz;
      eqBandInputs[i].disabled = outOfRange;
      eqBandEls[i].classList.toggle("eq-band-disabled", outOfRange);
    });
  }

  graph.eqFrequencies.forEach((freq, index) => {
    const band = document.createElement("div");
    band.className = "eq-band";

    const gainLabel = document.createElement("span");
    gainLabel.className = "eq-gain-label";
    gainLabel.textContent = "0dB";
    eqGainLabels.push(gainLabel);

    const input = document.createElement("input");
    input.type = "range";
    input.min = "-48";
    input.max = "24";
    input.step = "0.5";
    input.value = "0";
    input.addEventListener("input", () => {
      const db = Number(input.value);
      eqBandBaselineDb[index] = db;
      graph.setEqBandGain(index, db);
      gainLabel.textContent = fmtSigned(db, "dB");
    });
    input.addEventListener("dblclick", () => {
      input.value = "0";
      eqBandBaselineDb[index] = 0;
      graph.setEqBandGain(index, 0);
      gainLabel.textContent = "0dB";
    });

    const freqLabel = document.createElement("span");
    freqLabel.className = "eq-freq-label";
    freqLabel.textContent = formatFreq(freq);

    band.append(gainLabel, input, freqLabel);
    eqBandsContainer.appendChild(band);

    eqBandInputs.push(input);
    eqBandEls.push(band);
    eqBandBaselineDb.push(0);
  });

  updateEqBandAvailability();

  // Dragging a cutoff knob still leaves a small transient right at the current
  // cutoff frequency (see EffectsGraph.ts comment on setLowCutFreq/setHighCutFreq).
  // Ducking the two EQ bands straddling that frequency (the one just below and the
  // one just above) while the drag is in progress masks it. The dip is kept once the
  // knob is released (rather than springing back) so the -15dB duck sticks.
  const CUTOFF_DUCK_DB = 15;
  let duckedBandIndices: number[] = [];
  let duckedOriginalDb: number[] = [];

  /** Indices of the band immediately below and immediately above freqHz (in that order). */
  function adjacentEqBandIndices(freqHz: number): number[] {
    let below = -1;
    let above = -1;
    graph.eqFrequencies.forEach((freq, i) => {
      if (freq < freqHz && (below === -1 || freq > graph.eqFrequencies[below])) below = i;
      if (freq > freqHz && (above === -1 || freq < graph.eqFrequencies[above])) above = i;
    });
    return [below, above].filter((i) => i !== -1);
  }

  function sameIndices(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function duckEqBandNear(cutoffHz: number) {
    const indices = adjacentEqBandIndices(cutoffHz);
    // Mid-drag, the straddling pair can change as the cutoff crosses a band (including
    // crossing back over one it already passed). The old pair is no longer near the
    // cutoff, so it's restored to baseline rather than left ducked.
    if (duckedBandIndices.length && !sameIndices(duckedBandIndices, indices)) restoreDuckedEqBand();
    if (duckedBandIndices.length === 0) {
      duckedBandIndices = indices;
      // Always dip from the user's real baseline, never from the currently-displayed
      // value — that value may already be sitting at a previous duck's dip, and ducking
      // from it would compound (-15, -30, -45, ...) across repeated drags.
      duckedOriginalDb = indices.map((i) => eqBandBaselineDb[i]);
    }
    duckedBandIndices.forEach((index, k) => {
      const duckedDb = Math.max(-48, duckedOriginalDb[k] - CUTOFF_DUCK_DB);
      eqBandInputs[index].value = String(duckedDb);
      eqGainLabels[index].textContent = fmtSigned(duckedDb, "dB");
      graph.setEqBandGain(index, duckedDb);
      // One of the two ducked bands straddling the cutoff is, by definition, on the
      // side that's now out of range and dimmed to 35% opacity by updateEqBandAvailability()
      // above — at that opacity the -15dB dip is nearly invisible. Un-dim it for the
      // duration of the duck so the drag feedback is actually visible.
      eqBandEls[index].classList.remove("eq-band-disabled");
    });
  }

  /** Undoes the duck on the currently-tracked bands, putting them back at their
   *  pre-duck baseline — used when the cutoff moves away from them mid-drag. */
  function restoreDuckedEqBand() {
    duckedBandIndices.forEach((index, k) => {
      const original = duckedOriginalDb[k];
      eqBandInputs[index].value = String(original);
      eqGainLabels[index].textContent = fmtSigned(original, "dB");
      graph.setEqBandGain(index, original);
    });
    duckedBandIndices = [];
    duckedOriginalDb = [];
    updateEqBandAvailability();
  }

  /** Stops tracking the currently ducked bands as ducked, leaving their gain at the
   *  dipped value — the knob's release keeps the -15dB duck instead of undoing it. */
  function commitDuckedEqBand() {
    duckedBandIndices = [];
    duckedOriginalDb = [];
    updateEqBandAvailability();
  }

  lowCut.addEventListener("change", commitDuckedEqBand);
  highCut.addEventListener("change", commitDuckedEqBand);

  function resetEq() {
    eqBandsContainer.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((input, i) => {
      input.value = "0";
      eqBandBaselineDb[i] = 0;
      graph.setEqBandGain(i, 0);
      eqGainLabels[i].textContent = "0dB";
    });
    duckedBandIndices = [];
    duckedOriginalDb = [];
  }

  eqResetBtn.addEventListener("click", () => resetEq());

  lowCut.addEventListener("input", () => {
    lowCutHz = sliderToFreq(Number(lowCut.value), LOW_CUT_MIN, LOW_CUT_MAX);
    pendingLowCutHz = lowCutHz;
    lowCutValue.textContent = fmtCutoffFreq(lowCutHz);
    updateEqBandAvailability();
    duckEqBandNear(lowCutHz);
  });
  highCut.addEventListener("input", () => {
    highCutHz = sliderToFreq(Number(highCut.value), HIGH_CUT_MIN, HIGH_CUT_MAX);
    pendingHighCutHz = highCutHz;
    highCutValue.textContent = fmtCutoffFreq(highCutHz);
    updateEqBandAvailability();
    duckEqBandNear(highCutHz);
  });

  return {
    tick() {
      if (pendingLowCutHz !== null) {
        graph.setLowCutFreq(pendingLowCutHz);
        pendingLowCutHz = null;
      }
      if (pendingHighCutHz !== null) {
        graph.setHighCutFreq(pendingHighCutHz);
        pendingHighCutHz = null;
      }
    },
    getLowCutHz: () => lowCutHz,
    getHighCutHz: () => highCutHz,
    setCutoffs(lowHz, highHz) {
      lowCutHz = lowHz;
      highCutHz = highHz;
      lowCut.value = String(freqToSlider(lowHz, LOW_CUT_MIN, LOW_CUT_MAX));
      highCut.value = String(freqToSlider(highHz, HIGH_CUT_MIN, HIGH_CUT_MAX));
      lowCutValue.textContent = fmtCutoffFreq(lowHz);
      highCutValue.textContent = fmtCutoffFreq(highHz);
      graph.setLowCutFreq(lowHz);
      graph.setHighCutFreq(highHz);
      updateEqBandAvailability();
      // Mirror the manual-drag duck for a preset's cutoffs, but only where a cutoff
      // actually moved off its fully-open bound — a preset that leaves a cutoff at
      // its default (e.g. reset, nightcore) shouldn't dip a band just because that
      // bound happens to sit next to one on the frequency axis. Ducked one side at a
      // time (commit in between) so telephone's low *and* high cutoff can each duck
      // their own pair without the second call restoring the first's dip.
      if (lowHz > LOW_CUT_MIN) {
        duckEqBandNear(lowHz);
        commitDuckedEqBand();
      }
      if (highHz < HIGH_CUT_MAX) {
        duckEqBandNear(highHz);
        commitDuckedEqBand();
      }
    },
    reset() {
      duckedBandIndices = [];
      duckedOriginalDb = [];
      resetEq();
      updateEqBandAvailability();
    },
  };
}

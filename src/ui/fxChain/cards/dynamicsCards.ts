import type { EffectsGraph } from "../../../audio/EffectsGraph";
import { fmtHz } from "../../../utils/format";
import { buildLabeledSlider } from "../controlBuilders";
import type { Cfg, CreateChainCardShell } from "../cardShell";

export function createDynamicsCardBuilders(graph: EffectsGraph, createChainCardShell: CreateChainCardShell) {
  function createCompressorCard(id: string, cfg: Cfg<"compressor">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "compressor", true);

    const { row: threshRow, input: threshInput, valueSpan: threshValue } = buildLabeledSlider(
      "Threshold",
      -60,
      0,
      1,
      cfg.threshold,
      (n) => `${n.toFixed(0)}dB`,
    );
    const { row: ratioRow, input: ratioInput, valueSpan: ratioValue } = buildLabeledSlider(
      "Ratio",
      1,
      20,
      0.5,
      cfg.ratio,
      (n) => `${n.toFixed(1)}:1`,
    );
    const { row: attackRow, input: attackInput, valueSpan: attackValue } = buildLabeledSlider(
      "Attack",
      1,
      100,
      1,
      cfg.attack * 1000,
      (n) => `${n}ms`,
    );
    const { row: releaseRow, input: releaseInput, valueSpan: releaseValue } = buildLabeledSlider(
      "Release",
      50,
      1000,
      10,
      cfg.release * 1000,
      (n) => `${n}ms`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(threshRow, ratioRow, attackRow, releaseRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setCompressorEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    threshInput.addEventListener("input", () => {
      const db = Number(threshInput.value);
      graph.setCompressorThreshold(id, db);
      threshValue.textContent = `${db.toFixed(0)}dB`;
      cfg.threshold = db;
    });
    ratioInput.addEventListener("input", () => {
      const ratio = Number(ratioInput.value);
      graph.setCompressorRatio(id, ratio);
      ratioValue.textContent = `${ratio.toFixed(1)}:1`;
      cfg.ratio = ratio;
    });
    attackInput.addEventListener("input", () => {
      const ms = Number(attackInput.value);
      graph.setCompressorAttack(id, ms / 1000);
      attackValue.textContent = `${ms}ms`;
      cfg.attack = ms / 1000;
    });
    releaseInput.addEventListener("input", () => {
      const ms = Number(releaseInput.value);
      graph.setCompressorRelease(id, ms / 1000);
      releaseValue.textContent = `${ms}ms`;
      cfg.release = ms / 1000;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setCompressorMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setCompressorThreshold(id, cfg.threshold);
    graph.setCompressorRatio(id, cfg.ratio);
    graph.setCompressorAttack(id, cfg.attack);
    graph.setCompressorRelease(id, cfg.release);
    graph.setCompressorMix(id, cfg.mix);
    graph.setCompressorEnabled(id, cfg.enabled);

    return card;
  }

  function createNoiseGateCard(id: string, cfg: Cfg<"noise-gate">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "noise-gate", true);

    const { row: threshRow, input: threshInput, valueSpan: threshValue } = buildLabeledSlider(
      "Threshold",
      -80,
      0,
      1,
      cfg.threshold,
      (n) => `${n.toFixed(0)}dB`,
    );
    const { row: releaseRow, input: releaseInput, valueSpan: releaseValue } = buildLabeledSlider(
      "Release",
      10,
      1000,
      10,
      cfg.release,
      (n) => `${n}ms`,
    );
    body.append(threshRow, releaseRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setNoiseGateEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    threshInput.addEventListener("input", () => {
      const db = Number(threshInput.value);
      graph.setNoiseGateThreshold(id, db);
      threshValue.textContent = `${db.toFixed(0)}dB`;
      cfg.threshold = db;
    });
    releaseInput.addEventListener("input", () => {
      const ms = Number(releaseInput.value);
      graph.setNoiseGateRelease(id, ms);
      releaseValue.textContent = `${ms}ms`;
      cfg.release = ms;
    });

    graph.setNoiseGateThreshold(id, cfg.threshold);
    graph.setNoiseGateRelease(id, cfg.release);
    graph.setNoiseGateEnabled(id, cfg.enabled);

    return card;
  }

  function createSidechainCard(id: string, cfg: Cfg<"sidechain">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "sidechain", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.5, 8, 0.1, cfg.rate, fmtHz);
    const { row: depthRow, input: depthInput, valueSpan: depthValue } = buildLabeledSlider(
      "Depth",
      0,
      100,
      1,
      cfg.depth * 100,
      (n) => `${n}%`,
    );
    body.append(rateRow, depthRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setSidechainEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setSidechainRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const pct = Number(depthInput.value);
      graph.setSidechainDepth(id, pct / 100);
      depthValue.textContent = `${pct}%`;
      cfg.depth = pct / 100;
    });

    graph.setSidechainRate(id, cfg.rate);
    graph.setSidechainDepth(id, cfg.depth);
    graph.setSidechainEnabled(id, cfg.enabled);

    return card;
  }

  function createAutoWahCard(id: string, cfg: Cfg<"auto-wah">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "auto-wah", true);

    const { row: sensRow, input: sensInput, valueSpan: sensValue } = buildLabeledSlider(
      "Sensitivity",
      0,
      100,
      1,
      cfg.sensitivity * 100,
      (n) => `${n}%`,
    );
    const { row: freqRow, input: freqInput, valueSpan: freqValue } = buildLabeledSlider(
      "Base Freq",
      200,
      2000,
      10,
      cfg.baseFreq,
      (n) => `${Math.round(n)}Hz`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(sensRow, freqRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setAutoWahEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    sensInput.addEventListener("input", () => {
      const pct = Number(sensInput.value);
      graph.setAutoWahSensitivity(id, pct / 100);
      sensValue.textContent = `${pct}%`;
      cfg.sensitivity = pct / 100;
    });
    freqInput.addEventListener("input", () => {
      const hz = Number(freqInput.value);
      graph.setAutoWahBaseFreq(id, hz);
      freqValue.textContent = `${Math.round(hz)}Hz`;
      cfg.baseFreq = hz;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setAutoWahMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setAutoWahSensitivity(id, cfg.sensitivity);
    graph.setAutoWahBaseFreq(id, cfg.baseFreq);
    graph.setAutoWahMix(id, cfg.mix);
    graph.setAutoWahEnabled(id, cfg.enabled);

    return card;
  }

  return { createCompressorCard, createNoiseGateCard, createSidechainCard, createAutoWahCard };
}

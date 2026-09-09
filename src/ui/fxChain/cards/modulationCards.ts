import type { EffectsGraph } from "../../../audio/EffectsGraph";
import { fmtHz } from "../../../utils/format";
import { buildLabeledSlider } from "../controlBuilders";
import type { Cfg, CreateChainCardShell } from "../cardShell";

export function createModulationCardBuilders(graph: EffectsGraph, createChainCardShell: CreateChainCardShell) {
  function createAutoPanCard(id: string, cfg: Cfg<"auto-pan">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "auto-pan", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.05, 2, 0.01, cfg.rate, fmtHz);
    body.append(rateRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setAutoPanEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setAutoPanRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });

    graph.setAutoPanRate(id, cfg.rate);
    graph.setAutoPanEnabled(id, cfg.enabled);

    return card;
  }

  function createWowFlutterCard(id: string, cfg: Cfg<"wow-flutter">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "wow-flutter", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.1, 8, 0.01, cfg.rate, fmtHz);
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
        graph.setWowFlutterEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setWowFlutterRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const pct = Number(depthInput.value);
      graph.setWowFlutterDepth(id, pct / 100);
      depthValue.textContent = `${pct}%`;
      cfg.depth = pct / 100;
    });

    graph.setWowFlutterRate(id, cfg.rate);
    graph.setWowFlutterDepth(id, cfg.depth);
    graph.setWowFlutterEnabled(id, cfg.enabled);

    return card;
  }

  function createChorusCard(id: string, cfg: Cfg<"chorus">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "chorus", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.1, 5, 0.01, cfg.rate, fmtHz);
    const { row: depthRow, input: depthInput, valueSpan: depthValue } = buildLabeledSlider(
      "Depth",
      0,
      8,
      0.1,
      cfg.depth,
      (n) => `${n.toFixed(1)}ms`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(rateRow, depthRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setChorusEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setChorusRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const ms = Number(depthInput.value);
      graph.setChorusDepth(id, ms);
      depthValue.textContent = `${ms.toFixed(1)}ms`;
      cfg.depth = ms;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setChorusMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setChorusRate(id, cfg.rate);
    graph.setChorusDepth(id, cfg.depth);
    graph.setChorusMix(id, cfg.mix);
    graph.setChorusEnabled(id, cfg.enabled);

    return card;
  }

  function createFlangerCard(id: string, cfg: Cfg<"flanger">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "flanger", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.05, 2, 0.01, cfg.rate, fmtHz);
    const { row: depthRow, input: depthInput, valueSpan: depthValue } = buildLabeledSlider(
      "Depth",
      0,
      2.5,
      0.05,
      cfg.depth,
      (n) => `${n.toFixed(2)}ms`,
    );
    const { row: feedbackRow, input: feedbackInput, valueSpan: feedbackValue } = buildLabeledSlider(
      "Feedback",
      0,
      90,
      1,
      cfg.feedback * 100,
      (n) => `${n}%`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(rateRow, depthRow, feedbackRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setFlangerEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setFlangerRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const ms = Number(depthInput.value);
      graph.setFlangerDepth(id, ms);
      depthValue.textContent = `${ms.toFixed(2)}ms`;
      cfg.depth = ms;
    });
    feedbackInput.addEventListener("input", () => {
      const pct = Number(feedbackInput.value);
      graph.setFlangerFeedback(id, pct / 100);
      feedbackValue.textContent = `${pct}%`;
      cfg.feedback = pct / 100;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setFlangerMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setFlangerRate(id, cfg.rate);
    graph.setFlangerDepth(id, cfg.depth);
    graph.setFlangerFeedback(id, cfg.feedback);
    graph.setFlangerMix(id, cfg.mix);
    graph.setFlangerEnabled(id, cfg.enabled);

    return card;
  }

  function createPhaserCard(id: string, cfg: Cfg<"phaser">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "phaser", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.05, 3, 0.01, cfg.rate, fmtHz);
    const { row: depthRow, input: depthInput, valueSpan: depthValue } = buildLabeledSlider(
      "Depth",
      0,
      600,
      10,
      cfg.depth,
      (n) => `${Math.round(n)}Hz`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(rateRow, depthRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setPhaserEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setPhaserRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const hz = Number(depthInput.value);
      graph.setPhaserDepth(id, hz);
      depthValue.textContent = `${Math.round(hz)}Hz`;
      cfg.depth = hz;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setPhaserMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setPhaserRate(id, cfg.rate);
    graph.setPhaserDepth(id, cfg.depth);
    graph.setPhaserMix(id, cfg.mix);
    graph.setPhaserEnabled(id, cfg.enabled);

    return card;
  }

  function createTremoloCard(id: string, cfg: Cfg<"tremolo">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "tremolo", true);

    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider("Rate", 0.5, 15, 0.1, cfg.rate, fmtHz);
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
        graph.setTremoloEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    rateInput.addEventListener("input", () => {
      const hz = Number(rateInput.value);
      graph.setTremoloRate(id, hz);
      rateValue.textContent = fmtHz(hz);
      cfg.rate = hz;
    });
    depthInput.addEventListener("input", () => {
      const pct = Number(depthInput.value);
      graph.setTremoloDepth(id, pct / 100);
      depthValue.textContent = `${pct}%`;
      cfg.depth = pct / 100;
    });

    graph.setTremoloRate(id, cfg.rate);
    graph.setTremoloDepth(id, cfg.depth);
    graph.setTremoloEnabled(id, cfg.enabled);

    return card;
  }

  return { createAutoPanCard, createWowFlutterCard, createChorusCard, createFlangerCard, createPhaserCard, createTremoloCard };
}

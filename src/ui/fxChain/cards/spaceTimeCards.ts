import type { EffectsGraph } from "../../../audio/EffectsGraph";
import type { ReverbType, SwellLength } from "../../../audio/impulseResponse";
import { buildLabeledSlider, buildLabeledSelect } from "../controlBuilders";
import type { Cfg, CreateChainCardShell } from "../cardShell";

export function createSpaceTimeCardBuilders(graph: EffectsGraph, createChainCardShell: CreateChainCardShell) {
  function createDelayCard(id: string, cfg: Cfg<"delay">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "delay", true);

    const { row: timeRow, input: timeInput, valueSpan: timeValue } = buildLabeledSlider(
      "Time",
      0,
      1000,
      10,
      cfg.time * 1000,
      (n) => `${n} ms`,
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

    body.append(timeRow, feedbackRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setDelayEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    timeInput.addEventListener("input", () => {
      const ms = Number(timeInput.value);
      graph.setDelayTime(id, ms / 1000);
      timeValue.textContent = `${ms} ms`;
      cfg.time = ms / 1000;
    });
    feedbackInput.addEventListener("input", () => {
      const pct = Number(feedbackInput.value);
      graph.setDelayFeedback(id, pct / 100);
      feedbackValue.textContent = `${pct}%`;
      cfg.feedback = pct / 100;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setDelayMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setDelayTime(id, cfg.time);
    graph.setDelayFeedback(id, cfg.feedback);
    graph.setDelayMix(id, cfg.mix);
    graph.setDelayEnabled(id, cfg.enabled);

    return card;
  }

  function createReverbCard(id: string, cfg: Cfg<"reverb">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "reverb", true);

    const { row: typeRow, select: typeSelect } = buildLabeledSelect(
      "Space",
      [
        { value: "room", label: "Room" },
        { value: "hall", label: "Hall" },
        { value: "cathedral", label: "Cathedral" },
      ],
      cfg.reverbType,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);

    body.append(typeRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setReverbEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    typeSelect.addEventListener("change", () => {
      graph.setReverbType(id, typeSelect.value as ReverbType);
      cfg.reverbType = typeSelect.value as ReverbType;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setReverbMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setReverbType(id, cfg.reverbType);
    graph.setReverbMix(id, cfg.mix);
    graph.setReverbEnabled(id, cfg.enabled);

    return card;
  }

  function createSlapbackCard(id: string, cfg: Cfg<"slapback">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "slapback", true);

    const { row: timeRow, input: timeInput, valueSpan: timeValue } = buildLabeledSlider(
      "Time",
      60,
      150,
      1,
      cfg.time * 1000,
      (n) => `${n} ms`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(timeRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setSlapbackEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    timeInput.addEventListener("input", () => {
      const ms = Number(timeInput.value);
      graph.setSlapbackTime(id, ms / 1000);
      timeValue.textContent = `${ms} ms`;
      cfg.time = ms / 1000;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setSlapbackMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setSlapbackTime(id, cfg.time);
    graph.setSlapbackMix(id, cfg.mix);
    graph.setSlapbackEnabled(id, cfg.enabled);

    return card;
  }

  function createReverseSwellCard(id: string, cfg: Cfg<"reverse-swell">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "reverse-swell", true);

    const { row: lengthRow, select: lengthSelect } = buildLabeledSelect(
      "Length",
      [
        { value: "short", label: "Short" },
        { value: "medium", label: "Medium" },
        { value: "long", label: "Long" },
      ],
      cfg.length,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(lengthRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setReverseSwellEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    lengthSelect.addEventListener("change", () => {
      graph.setReverseSwellLength(id, lengthSelect.value as SwellLength);
      cfg.length = lengthSelect.value as SwellLength;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setReverseSwellMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setReverseSwellLength(id, cfg.length);
    graph.setReverseSwellMix(id, cfg.mix);
    graph.setReverseSwellEnabled(id, cfg.enabled);

    return card;
  }

  function createReverseDelayCard(id: string, cfg: Cfg<"reverse-delay">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "reverse-delay", true);

    const { row: timeRow, input: timeInput, valueSpan: timeValue } = buildLabeledSlider(
      "Time",
      50,
      1000,
      10,
      cfg.time * 1000,
      (n) => `${n} ms`,
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

    body.append(timeRow, feedbackRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setReverseDelayEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    timeInput.addEventListener("input", () => {
      const ms = Number(timeInput.value);
      graph.setReverseDelayTime(id, ms / 1000);
      timeValue.textContent = `${ms} ms`;
      cfg.time = ms / 1000;
    });
    feedbackInput.addEventListener("input", () => {
      const pct = Number(feedbackInput.value);
      graph.setReverseDelayFeedback(id, pct / 100);
      feedbackValue.textContent = `${pct}%`;
      cfg.feedback = pct / 100;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setReverseDelayMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setReverseDelayTime(id, cfg.time);
    graph.setReverseDelayFeedback(id, cfg.feedback);
    graph.setReverseDelayMix(id, cfg.mix);
    graph.setReverseDelayEnabled(id, cfg.enabled);

    return card;
  }

  function createFreezeCard(id: string, cfg: Cfg<"freeze">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "freeze", true);

    const { row: timeRow, input: timeInput, valueSpan: timeValue } = buildLabeledSlider(
      "Time",
      50,
      250,
      5,
      cfg.time * 1000,
      (n) => `${n} ms`,
    );
    body.append(timeRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setFreezeEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    timeInput.addEventListener("input", () => {
      const ms = Number(timeInput.value);
      graph.setFreezeTime(id, ms / 1000);
      timeValue.textContent = `${ms} ms`;
      cfg.time = ms / 1000;
    });

    graph.setFreezeTime(id, cfg.time);
    graph.setFreezeEnabled(id, cfg.enabled);

    return card;
  }

  function createStutterCard(id: string, cfg: Cfg<"stutter">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "stutter", true);

    const { row: windowRow, input: windowInput, valueSpan: windowValue } = buildLabeledSlider(
      "Window",
      20,
      300,
      5,
      cfg.window,
      (n) => `${n} ms`,
    );
    body.append(windowRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setStutterEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    windowInput.addEventListener("input", () => {
      const ms = Number(windowInput.value);
      graph.setStutterWindow(id, ms);
      windowValue.textContent = `${ms} ms`;
      cfg.window = ms;
    });

    graph.setStutterWindow(id, cfg.window);
    graph.setStutterEnabled(id, cfg.enabled);

    return card;
  }

  return { createDelayCard, createReverbCard, createSlapbackCard, createReverseSwellCard, createReverseDelayCard, createFreezeCard, createStutterCard };
}

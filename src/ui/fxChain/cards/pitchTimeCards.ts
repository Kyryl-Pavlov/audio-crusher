import type { EffectsGraph } from "../../../audio/EffectsGraph";
import { fmtSigned } from "../../../utils/format";
import { buildLabeledSlider } from "../controlBuilders";
import type { Cfg, CreateChainCardShell } from "../cardShell";

export function createPitchTimeCardBuilders(graph: EffectsGraph, createChainCardShell: CreateChainCardShell) {
  function createPitchShiftCard(id: string, cfg: Cfg<"pitch-shift">): HTMLElement {
    const { card, body } = createChainCardShell(id, "pitch-shift", false);
    const { row, input, valueSpan } = buildLabeledSlider("Semitones", -24, 24, 1, cfg.semitones, (n) => fmtSigned(n, " st"));
    input.addEventListener("input", () => {
      const semi = Number(input.value);
      graph.setPitchShiftSemitones(id, semi);
      valueSpan.textContent = fmtSigned(semi, " st");
      cfg.semitones = semi;
    });
    body.append(row);
    graph.setPitchShiftSemitones(id, cfg.semitones);
    return card;
  }

  function createHarmonizerCard(id: string, cfg: Cfg<"harmonizer">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "harmonizer", true);

    const { row: semiRow, input: semiInput, valueSpan: semiValue } = buildLabeledSlider(
      "Semitones",
      -24,
      24,
      1,
      cfg.semitones,
      (n) => fmtSigned(n, " st"),
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(semiRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setHarmonizerEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    semiInput.addEventListener("input", () => {
      const semi = Number(semiInput.value);
      graph.setHarmonizerSemitones(id, semi);
      semiValue.textContent = fmtSigned(semi, " st");
      cfg.semitones = semi;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setHarmonizerMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setHarmonizerSemitones(id, cfg.semitones);
    graph.setHarmonizerMix(id, cfg.mix);
    graph.setHarmonizerEnabled(id, cfg.enabled);

    return card;
  }

  function createStereoWidenerCard(id: string, cfg: Cfg<"stereo-widener">): HTMLElement {
    const { card, body } = createChainCardShell(id, "stereo-widener", false);

    const { row: widthRow, input: widthInput, valueSpan: widthValue } = buildLabeledSlider(
      "Width",
      0,
      200,
      1,
      cfg.width * 100,
      (n) => `${n}%`,
    );
    body.append(widthRow);

    widthInput.addEventListener("input", () => {
      const pct = Number(widthInput.value);
      graph.setStereoWidenerWidth(id, pct / 100);
      widthValue.textContent = `${pct}%`;
      cfg.width = pct / 100;
    });

    graph.setStereoWidenerWidth(id, cfg.width);

    return card;
  }

  return { createPitchShiftCard, createHarmonizerCard, createStereoWidenerCard };
}

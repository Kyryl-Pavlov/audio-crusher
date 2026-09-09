import type { EffectsGraph } from "../../../audio/EffectsGraph";
import type { DriveType } from "../../../audio/distortionCurve";
import type { CabinetType } from "../../../audio/impulseResponse";
import type { VinylIntensity } from "../../../audio/vinylNoise";
import type { VowelType } from "../../../audio/modules/types";
import { DRIVE_TONE_MIN, DRIVE_TONE_MAX, sliderToFreq } from "../../../audio/ranges";
import { fmtCutoffFreq } from "../../../utils/format";
import { buildLabeledSlider, buildLabeledSelect } from "../controlBuilders";
import type { Cfg, CreateChainCardShell } from "../cardShell";

export function createTextureCardBuilders(graph: EffectsGraph, createChainCardShell: CreateChainCardShell) {
  function createDriveCard(id: string, cfg: Cfg<"drive">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "drive", true);

    const { row: typeRow, select: typeSelect } = buildLabeledSelect(
      "Type",
      [
        { value: "overdrive", label: "Overdrive" },
        { value: "distortion", label: "Distortion" },
      ],
      cfg.driveType,
    );
    const { row: amountRow, input: amountInput, valueSpan: amountValue } = buildLabeledSlider(
      "Amount",
      0,
      100,
      1,
      cfg.amount * 100,
      (n) => `${n}%`,
    );
    const { row: toneRow, input: toneInput, valueSpan: toneValue } = buildLabeledSlider("Tone", 0, 1, 0.001, cfg.tone, (n) =>
      fmtCutoffFreq(sliderToFreq(n, DRIVE_TONE_MIN, DRIVE_TONE_MAX)),
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);

    body.append(typeRow, amountRow, toneRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setDriveEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    typeSelect.addEventListener("change", () => {
      graph.setDriveType(id, typeSelect.value as DriveType);
      cfg.driveType = typeSelect.value as DriveType;
    });
    amountInput.addEventListener("input", () => {
      const pct = Number(amountInput.value);
      graph.setDriveAmount(id, pct / 100);
      amountValue.textContent = `${pct}%`;
      cfg.amount = pct / 100;
    });
    toneInput.addEventListener("input", () => {
      const raw = Number(toneInput.value);
      const hz = sliderToFreq(raw, DRIVE_TONE_MIN, DRIVE_TONE_MAX);
      graph.setDriveTone(id, hz);
      toneValue.textContent = fmtCutoffFreq(hz);
      cfg.tone = raw;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setDriveMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setDriveType(id, cfg.driveType);
    graph.setDriveAmount(id, cfg.amount);
    graph.setDriveTone(id, sliderToFreq(cfg.tone, DRIVE_TONE_MIN, DRIVE_TONE_MAX));
    graph.setDriveMix(id, cfg.mix);
    graph.setDriveEnabled(id, cfg.enabled);

    return card;
  }

  function createBitcrusherCard(id: string, cfg: Cfg<"bitcrusher">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "bitcrusher", true);

    const { row: bitsRow, input: bitsInput, valueSpan: bitsValue } = buildLabeledSlider(
      "Bits",
      1,
      16,
      1,
      cfg.bits,
      (n) => `${n}`,
    );
    const { row: rateRow, input: rateInput, valueSpan: rateValue } = buildLabeledSlider(
      "Rate Reduction",
      1,
      50,
      1,
      cfg.rateReduction,
      (n) => `${n}x`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(bitsRow, rateRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setBitcrusherEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    bitsInput.addEventListener("input", () => {
      const bits = Number(bitsInput.value);
      graph.setBitcrusherBits(id, bits);
      bitsValue.textContent = `${bits}`;
      cfg.bits = bits;
    });
    rateInput.addEventListener("input", () => {
      const steps = Number(rateInput.value);
      graph.setBitcrusherRateReduction(id, steps);
      rateValue.textContent = `${steps}x`;
      cfg.rateReduction = steps;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setBitcrusherMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setBitcrusherBits(id, cfg.bits);
    graph.setBitcrusherRateReduction(id, cfg.rateReduction);
    graph.setBitcrusherMix(id, cfg.mix);
    graph.setBitcrusherEnabled(id, cfg.enabled);

    return card;
  }

  function createRingModCard(id: string, cfg: Cfg<"ring-mod">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "ring-mod", true);

    const { row: freqRow, input: freqInput, valueSpan: freqValue } = buildLabeledSlider(
      "Frequency",
      20,
      2000,
      1,
      cfg.frequency,
      (n) => `${Math.round(n)}Hz`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(freqRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setRingModEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    freqInput.addEventListener("input", () => {
      const hz = Number(freqInput.value);
      graph.setRingModFrequency(id, hz);
      freqValue.textContent = `${Math.round(hz)}Hz`;
      cfg.frequency = hz;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setRingModMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setRingModFrequency(id, cfg.frequency);
    graph.setRingModMix(id, cfg.mix);
    graph.setRingModEnabled(id, cfg.enabled);

    return card;
  }

  function createMultibandDistortionCard(id: string, cfg: Cfg<"multiband-distortion">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "multiband-distortion", true);

    const { row: lowRow, input: lowInput, valueSpan: lowValue } = buildLabeledSlider("Low", 0, 100, 1, cfg.low * 100, (n) => `${n}%`);
    const { row: midRow, input: midInput, valueSpan: midValue } = buildLabeledSlider("Mid", 0, 100, 1, cfg.mid * 100, (n) => `${n}%`);
    const { row: highRow, input: highInput, valueSpan: highValue } = buildLabeledSlider("High", 0, 100, 1, cfg.high * 100, (n) => `${n}%`);
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(lowRow, midRow, highRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setMultibandDistortionEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    lowInput.addEventListener("input", () => {
      const pct = Number(lowInput.value);
      graph.setMultibandDistortionLow(id, pct / 100);
      lowValue.textContent = `${pct}%`;
      cfg.low = pct / 100;
    });
    midInput.addEventListener("input", () => {
      const pct = Number(midInput.value);
      graph.setMultibandDistortionMid(id, pct / 100);
      midValue.textContent = `${pct}%`;
      cfg.mid = pct / 100;
    });
    highInput.addEventListener("input", () => {
      const pct = Number(highInput.value);
      graph.setMultibandDistortionHigh(id, pct / 100);
      highValue.textContent = `${pct}%`;
      cfg.high = pct / 100;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setMultibandDistortionMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setMultibandDistortionLow(id, cfg.low);
    graph.setMultibandDistortionMid(id, cfg.mid);
    graph.setMultibandDistortionHigh(id, cfg.high);
    graph.setMultibandDistortionMix(id, cfg.mix);
    graph.setMultibandDistortionEnabled(id, cfg.enabled);

    return card;
  }

  function createTelephoneCard(id: string, cfg: Cfg<"telephone">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "telephone", true);

    const { row: crunchRow, input: crunchInput, valueSpan: crunchValue } = buildLabeledSlider(
      "Crunch",
      0,
      100,
      1,
      cfg.crunch * 100,
      (n) => `${n}%`,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(crunchRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setTelephoneEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    crunchInput.addEventListener("input", () => {
      const pct = Number(crunchInput.value);
      graph.setTelephoneCrunch(id, pct / 100);
      crunchValue.textContent = `${pct}%`;
      cfg.crunch = pct / 100;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setTelephoneMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setTelephoneCrunch(id, cfg.crunch);
    graph.setTelephoneMix(id, cfg.mix);
    graph.setTelephoneEnabled(id, cfg.enabled);

    return card;
  }

  function createCabinetCard(id: string, cfg: Cfg<"cabinet">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "cabinet", true);

    const { row: typeRow, select: typeSelect } = buildLabeledSelect(
      "Type",
      [
        { value: "phone", label: "Phone" },
        { value: "am-radio", label: "AM Radio" },
        { value: "small-speaker", label: "Small Speaker" },
      ],
      cfg.cabinetType,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(typeRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setCabinetEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    typeSelect.addEventListener("change", () => {
      graph.setCabinetType(id, typeSelect.value as CabinetType);
      cfg.cabinetType = typeSelect.value as CabinetType;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setCabinetMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setCabinetType(id, cfg.cabinetType);
    graph.setCabinetMix(id, cfg.mix);
    graph.setCabinetEnabled(id, cfg.enabled);

    return card;
  }

  function createFormantCard(id: string, cfg: Cfg<"formant">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "formant", true);

    const { row: vowelRow, select: vowelSelect } = buildLabeledSelect(
      "Vowel",
      [
        { value: "a", label: "A" },
        { value: "e", label: "E" },
        { value: "i", label: "I" },
        { value: "o", label: "O" },
        { value: "u", label: "U" },
      ],
      cfg.vowel,
    );
    const { row: mixRow, input: mixInput, valueSpan: mixValue } = buildLabeledSlider("Mix", 0, 100, 1, cfg.mix * 100, (n) => `${n}%`);
    body.append(vowelRow, mixRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setFormantEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    vowelSelect.addEventListener("change", () => {
      graph.setFormantVowel(id, vowelSelect.value as VowelType);
      cfg.vowel = vowelSelect.value as VowelType;
    });
    mixInput.addEventListener("input", () => {
      const pct = Number(mixInput.value);
      graph.setFormantMix(id, pct / 100);
      mixValue.textContent = `${pct}%`;
      cfg.mix = pct / 100;
    });

    graph.setFormantVowel(id, cfg.vowel);
    graph.setFormantMix(id, cfg.mix);
    graph.setFormantEnabled(id, cfg.enabled);

    return card;
  }

  function createVinylCard(id: string, cfg: Cfg<"vinyl">): HTMLElement {
    const { card, body, ledInput } = createChainCardShell(id, "vinyl", true);

    const { row: intensityRow, select: intensitySelect } = buildLabeledSelect(
      "Wear",
      [
        { value: "light", label: "Light" },
        { value: "medium", label: "Medium" },
        { value: "heavy", label: "Heavy" },
      ],
      cfg.intensity,
    );
    const { row: amountRow, input: amountInput, valueSpan: amountValue } = buildLabeledSlider(
      "Amount",
      0,
      100,
      1,
      cfg.amount * 100,
      (n) => `${n}%`,
    );
    body.append(intensityRow, amountRow);

    if (ledInput) {
      ledInput.checked = cfg.enabled;
      ledInput.addEventListener("change", () => {
        graph.setVinylEnabled(id, ledInput.checked);
        cfg.enabled = ledInput.checked;
      });
    }
    intensitySelect.addEventListener("change", () => {
      graph.setVinylIntensity(id, intensitySelect.value as VinylIntensity);
      cfg.intensity = intensitySelect.value as VinylIntensity;
    });
    amountInput.addEventListener("input", () => {
      const pct = Number(amountInput.value);
      graph.setVinylAmount(id, pct / 100);
      amountValue.textContent = `${pct}%`;
      cfg.amount = pct / 100;
    });

    graph.setVinylIntensity(id, cfg.intensity);
    graph.setVinylAmount(id, cfg.amount);
    graph.setVinylEnabled(id, cfg.enabled);

    return card;
  }

  return { createDriveCard, createBitcrusherCard, createRingModCard, createMultibandDistortionCard, createTelephoneCard, createCabinetCard, createFormantCard, createVinylCard };
}

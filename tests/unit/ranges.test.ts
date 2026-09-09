import test from "node:test";
import assert from "node:assert/strict";
import { sliderToFreq, freqToSlider } from "../../src/audio/ranges.ts";

test("sliderToFreq maps 0/1 to min/max", () => {
  assert.equal(sliderToFreq(0, 100, 1000), 100);
  assert.equal(sliderToFreq(1, 100, 1000), 1000);
});

test("sliderToFreq / freqToSlider round-trip", () => {
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const hz = sliderToFreq(t, 20, 20000);
    const back = freqToSlider(hz, 20, 20000);
    assert.ok(Math.abs(back - t) < 1e-9, `t=${t} -> hz=${hz} -> back=${back}`);
  }
});

test("freqToSlider clamps out-of-range Hz to [0, 1]", () => {
  assert.equal(freqToSlider(1, 100, 1000), 0);
  assert.equal(freqToSlider(1_000_000, 100, 1000), 1);
});

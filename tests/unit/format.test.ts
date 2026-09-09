import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, formatFreq, fmtSigned, fmtHz, fmtSpeed, fmtCutoffFreq } from "../../src/utils/format.ts";

test("formatTime", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65), "1:05");
  assert.equal(formatTime(600), "10:00");
  // Negative/NaN input (e.g. before a track loads) clamps to 0 rather than showing garbage.
  assert.equal(formatTime(-5), "0:00");
  assert.equal(formatTime(NaN), "0:00");
});

test("formatFreq", () => {
  assert.equal(formatFreq(500), "500Hz");
  assert.equal(formatFreq(1000), "1kHz");
  assert.equal(formatFreq(1500), "1.5kHz");
});

test("fmtSigned", () => {
  assert.equal(fmtSigned(5, " st"), "+5 st");
  assert.equal(fmtSigned(-5, " st"), "-5 st");
  assert.equal(fmtSigned(0, " st"), "0 st");
});

test("fmtHz", () => {
  assert.equal(fmtHz(440), "440.00 Hz");
});

test("fmtSpeed", () => {
  assert.equal(fmtSpeed(1), "1.00×");
  assert.equal(fmtSpeed(0.5), "0.50×");
});

test("fmtCutoffFreq", () => {
  assert.equal(fmtCutoffFreq(500), "500Hz");
  assert.equal(fmtCutoffFreq(1500), "1.5kHz");
  assert.equal(fmtCutoffFreq(999.6), "1000Hz");
});

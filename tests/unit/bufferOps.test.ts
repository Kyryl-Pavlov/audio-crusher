import test from "node:test";
import assert from "node:assert/strict";
import { reverseAudioBuffer } from "../../src/audio/reverseBuffer.ts";
import { trimAudioBuffer } from "../../src/audio/trimBuffer.ts";

/** Minimal BaseAudioContext stand-in: createBuffer() is the only API these two pure
 *  buffer-transform functions call, so a real AudioContext isn't needed to test them. */
function fakeCtx(): BaseAudioContext {
  return {
    createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        numberOfChannels,
        length,
        sampleRate,
        getChannelData: (ch: number) => channels[ch],
      } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

function makeBuffer(samples: number[], sampleRate = 1): AudioBuffer {
  const buf = fakeCtx().createBuffer(1, samples.length, sampleRate);
  buf.getChannelData(0).set(samples);
  return buf;
}

test("reverseAudioBuffer reverses each channel's samples", () => {
  const buf = makeBuffer([1, 2, 3, 4]);
  const reversed = reverseAudioBuffer(fakeCtx(), buf);
  assert.deepEqual(Array.from(reversed.getChannelData(0)), [4, 3, 2, 1]);
});

test("reverseAudioBuffer preserves channel count and sample rate", () => {
  const ctx = fakeCtx();
  const buf = ctx.createBuffer(2, 3, 44100);
  buf.getChannelData(0).set([1, 2, 3]);
  buf.getChannelData(1).set([4, 5, 6]);
  const reversed = reverseAudioBuffer(ctx, buf);
  assert.equal(reversed.numberOfChannels, 2);
  assert.equal(reversed.sampleRate, 44100);
  assert.deepEqual(Array.from(reversed.getChannelData(0)), [3, 2, 1]);
  assert.deepEqual(Array.from(reversed.getChannelData(1)), [6, 5, 4]);
});

test("trimAudioBuffer slices the requested time window", () => {
  // sampleRate=10 -> 1 sample per 0.1s, so [0.2, 0.5) is samples [2, 5).
  const buf = makeBuffer([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10);
  const trimmed = trimAudioBuffer(fakeCtx(), buf, 0.2, 0.5);
  assert.deepEqual(Array.from(trimmed.getChannelData(0)), [2, 3, 4]);
});

test("trimAudioBuffer clamps an out-of-range window to the buffer's bounds", () => {
  const buf = makeBuffer([0, 1, 2, 3], 10);
  const trimmed = trimAudioBuffer(fakeCtx(), buf, -1, 10);
  assert.deepEqual(Array.from(trimmed.getChannelData(0)), [0, 1, 2, 3]);
});

test("trimAudioBuffer never returns a zero-length buffer", () => {
  const buf = makeBuffer([0, 1, 2, 3], 10);
  const trimmed = trimAudioBuffer(fakeCtx(), buf, 0.2, 0.2);
  assert.equal(trimmed.length, 1);
});

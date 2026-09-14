import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";

const PORT = 5185;
const URL = `http://localhost:${PORT}/`;
const WORKLET_URL = `http://localhost:${PORT}/src/audio/worklets/liveSpeedProcessor.js`;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not up yet -- keep polling.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

let server: ChildProcess;
let browser: Browser;

test.before(async () => {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  await waitForServer(URL, 20_000);
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  server?.kill();
});

/** Renders the worklet through an OfflineAudioContext with a given `speed` and input
 *  buffer, returning the rendered channel-0 samples. Runs entirely inside the page so
 *  it exercises the real worklet file the app loads (not a re-implementation), without
 *  needing the real getDisplayMedia() dialog live capture normally goes through --
 *  connectLiveStream() just needs *a* MediaStream, and OfflineAudioContext renders
 *  sample-for-sample identically to how it would behave live (this worklet's timing is
 *  driven entirely by sample counts, never wall-clock time). */
async function renderLiveSpeed(
  page: import("playwright").Page,
  input: number[],
  speed: number,
  renderSeconds: number,
): Promise<Float32Array> {
  return page.evaluate(
    async ({ workletUrl, input, speed, renderSeconds }) => {
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(1, Math.round(sampleRate * renderSeconds), sampleRate);
      await ctx.audioWorklet.addModule(workletUrl);

      const buf = ctx.createBuffer(1, input.length, sampleRate);
      buf.getChannelData(0).set(input);
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const node = new AudioWorkletNode(ctx, "live-speed-processor");
      node.parameters.get("speed")!.value = speed;

      src.connect(node);
      node.connect(ctx.destination);
      src.start();

      const rendered = await ctx.startRendering();
      return Array.from(rendered.getChannelData(0));
    },
    { workletUrl: WORKLET_URL, input, speed, renderSeconds },
  ) as unknown as Promise<Float32Array>;
}

/** Like renderLiveSpeed, but also collects every `achievedSpeed` message the worklet
 *  posts (see liveSpeedProcessor.js's `achievedSpeed` field) and returns the last one --
 *  the settled estimate of source-samples-consumed-per-output-sample once it's had time
 *  to converge. */
async function renderLiveSpeedAndGetAchievedSpeed(
  page: import("playwright").Page,
  input: number[],
  speed: number,
  renderSeconds: number,
): Promise<number> {
  return page.evaluate(
    async ({ workletUrl, input, speed, renderSeconds }) => {
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(1, Math.round(sampleRate * renderSeconds), sampleRate);
      await ctx.audioWorklet.addModule(workletUrl);

      const buf = ctx.createBuffer(1, input.length, sampleRate);
      buf.getChannelData(0).set(input);
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const node = new AudioWorkletNode(ctx, "live-speed-processor");
      node.parameters.get("speed")!.value = speed;

      let lastAchievedSpeed = 1;
      node.port.onmessage = (e) => {
        if (e.data?.type === "achievedSpeed") lastAchievedSpeed = e.data.value;
      };

      src.connect(node);
      node.connect(ctx.destination);
      src.start();

      await ctx.startRendering();
      return lastAchievedSpeed;
    },
    { workletUrl: WORKLET_URL, input, speed, renderSeconds },
  );
}

/** Like renderLiveSpeedAndGetAchievedSpeed, but returns every reported achievedSpeed
 *  value (in order) instead of just the last one -- for checking the *trajectory* over
 *  a long render (e.g. that it recovers after a backlog-exhaustion skip, rather than
 *  permanently settling at the wrong value). */
async function renderLiveSpeedAndGetAchievedSpeedLog(
  page: import("playwright").Page,
  input: number[],
  speed: number,
  renderSeconds: number,
  processorOptions?: { ringSeconds?: number; maxLagSeconds?: number; skipTargetLagSeconds?: number },
): Promise<number[]> {
  return page.evaluate(
    async ({ workletUrl, input, speed, renderSeconds, processorOptions }) => {
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(1, Math.round(sampleRate * renderSeconds), sampleRate);
      await ctx.audioWorklet.addModule(workletUrl);

      const buf = ctx.createBuffer(1, input.length, sampleRate);
      buf.getChannelData(0).set(input);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const node = new AudioWorkletNode(ctx, "live-speed-processor", { processorOptions });
      node.parameters.get("speed")!.value = speed;

      const log: number[] = [];
      node.port.onmessage = (e) => {
        if (e.data?.type === "achievedSpeed") log.push(e.data.value);
      };

      src.connect(node);
      node.connect(ctx.destination);
      src.start();

      await ctx.startRendering();
      return log;
    },
    { workletUrl: WORKLET_URL, input, speed, renderSeconds, processorOptions },
  );
}

/** Builds a test signal: silence, except for a short unit-amplitude blip (a few samples
 *  wide, so OLA windowing/interpolation can't smear it into inaudibility) at each of
 *  `impulseTimes` (seconds), padded with trailing silence out to `totalSeconds`. */
function impulseTrack(impulseTimes: number[], totalSeconds: number, sampleRate = 44100): number[] {
  const samples = new Array(Math.round(totalSeconds * sampleRate)).fill(0);
  for (const t of impulseTimes) {
    const center = Math.round(t * sampleRate);
    for (let d = -4; d <= 4; d++) {
      const i = center + d;
      if (i >= 0 && i < samples.length) samples[i] = 1;
    }
  }
  return samples;
}

/** Finds the sample index of each local energy peak taller than `minGapSeconds` apart,
 *  by sliding-window RMS -- robust to the impulse's energy being spread by windowing. */
function findPeakTimes(rendered: Float32Array, sampleRate: number, minGapSeconds: number): number[] {
  const windowSize = Math.round(sampleRate * 0.005);
  const energy = new Float32Array(rendered.length);
  let sum = 0;
  for (let i = 0; i < rendered.length; i++) {
    sum += rendered[i] * rendered[i];
    if (i >= windowSize) sum -= rendered[i - windowSize] * rendered[i - windowSize];
    energy[i] = sum;
  }
  const minGapSamples = Math.round(sampleRate * minGapSeconds);
  const peaks: number[] = [];
  let maxEnergy = 0;
  for (let i = 0; i < energy.length; i++) maxEnergy = Math.max(maxEnergy, energy[i]);
  const threshold = maxEnergy * 0.2;
  let lastPeak = -Infinity;
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] < threshold) continue;
    if (energy[i] >= energy[i - 1] && energy[i] >= energy[i + 1] && i - lastPeak >= minGapSamples) {
      peaks.push(i);
      lastPeak = i;
    }
  }
  return peaks.map((i) => i / sampleRate);
}

/** Estimates dominant frequency over a window via zero-crossing rate. */
function estimateFrequency(rendered: Float32Array, sampleRate: number, startSec: number, durationSec: number): number {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(rendered.length, Math.round((startSec + durationSec) * sampleRate));
  let crossings = 0;
  for (let i = start + 1; i < end; i++) {
    if (rendered[i - 1] < 0 !== rendered[i] < 0) crossings++;
  }
  return crossings / 2 / durationSec;
}

test("live-speed-processor slows tempo down while preserving pitch (speed 0.5)", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const impulseSpacing = 0.5;
  const input = impulseTrack([0.3, 0.8, 1.3, 1.8, 2.3], 3, sampleRate);

  const rendered = await renderLiveSpeed(page, input, 0.5, 8);
  const peaks = findPeakTimes(new Float32Array(rendered), sampleRate, 0.2);

  assert.ok(peaks.length >= 3, `expected at least 3 detected impulses, got ${peaks.length}: ${peaks}`);
  const gaps = peaks.slice(1).map((t, i) => t - peaks[i]);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const expectedGap = impulseSpacing / 0.5; // slowing to half speed should double the spacing
  assert.ok(
    Math.abs(avgGap - expectedGap) < expectedGap * 0.3,
    `average gap between impulses ${avgGap.toFixed(3)}s should be close to ${expectedGap}s (2x the source spacing) at speed 0.5`,
  );

  await page.close();
});

// A live stream never has a "backlog" to fast-forward through unless it was slowed
// down first -- input arrives at exactly 1x real time regardless of the speed setting,
// so speed > 1 starting fresh has nothing to catch up on and is correctly clamped to
// ~1x (see liveSpeedProcessor.js's minLagSamples clamp). The meaningful case for
// speed > 1 is catching up after having been slowed down, so this test builds a
// backlog with a slow phase, then switches to speed 2 partway through and confirms the
// backlogged content (a click placed 1s into the source) surfaces sooner than it does
// under a constant slow speed with no catch-up.
test("live-speed-processor catches up faster than real time once sped up", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const input = impulseTrack([1.0], 9, sampleRate);

  const renderWithAutomation = (speedSteps: { time: number; value: number }[], renderSeconds: number) =>
    page.evaluate(
      async ({ workletUrl, input, speedSteps, renderSeconds }) => {
        const sampleRate = 44100;
        const ctx = new OfflineAudioContext(1, Math.round(sampleRate * renderSeconds), sampleRate);
        await ctx.audioWorklet.addModule(workletUrl);

        const buf = ctx.createBuffer(1, input.length, sampleRate);
        buf.getChannelData(0).set(input);
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const node = new AudioWorkletNode(ctx, "live-speed-processor");
        const speedParam = node.parameters.get("speed")!;
        for (const step of speedSteps) speedParam.setValueAtTime(step.value, step.time);

        src.connect(node);
        node.connect(ctx.destination);
        src.start();

        const rendered = await ctx.startRendering();
        return Array.from(rendered.getChannelData(0));
      },
      { workletUrl: WORKLET_URL, input, speedSteps, renderSeconds },
    ) as unknown as Promise<number[]>;

  const [constantSlow, catchUp] = await Promise.all([
    renderWithAutomation([{ time: 0, value: 0.25 }], 10),
    renderWithAutomation(
      [
        { time: 0, value: 0.25 },
        { time: 2, value: 2 },
      ],
      10,
    ),
  ]);

  const constantSlowPeaks = findPeakTimes(new Float32Array(constantSlow), sampleRate, 0.2);
  const catchUpPeaks = findPeakTimes(new Float32Array(catchUp), sampleRate, 0.2);

  assert.ok(constantSlowPeaks.length >= 1, `expected the click to surface under constant slow speed, got ${constantSlowPeaks}`);
  assert.ok(catchUpPeaks.length >= 1, `expected the click to surface after catching up, got ${catchUpPeaks}`);

  const constantSlowTime = constantSlowPeaks[0];
  const catchUpTime = catchUpPeaks[0];
  assert.ok(
    catchUpTime < constantSlowTime * 0.75,
    `switching to speed 2 at t=2s should surface the backlogged click well before the constant-0.25x render does ` +
      `(got ${catchUpTime.toFixed(2)}s vs ${constantSlowTime.toFixed(2)}s)`,
  );

  await page.close();
});

/** Goertzel-style single-frequency energy magnitude over a window -- used to check
 *  whether a specific tone is present, without needing a full FFT. */
function toneEnergyAt(rendered: Float32Array, sampleRate: number, freq: number, startSec: number, durationSec: number): number {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(rendered.length, Math.round((startSec + durationSec) * sampleRate));
  const w = (2 * Math.PI * freq) / sampleRate;
  let re = 0;
  let im = 0;
  for (let i = start; i < end; i++) {
    re += rendered[i] * Math.cos(w * (i - start));
    im += rendered[i] * Math.sin(w * (i - start));
  }
  const n = end - start;
  return Math.sqrt(re * re + im * im) / n;
}

// Regression test for a real bug: the two OLA voices' source positions are always
// offset from each other by ~hopIn, so a safety-margin check against only one voice
// left the other free to read unwritten data (catching up) or ring-buffer-wrapped
// stale data (falling behind) -- heard as a faint, wrongly-timed "echo" of audio from
// roughly one ring-buffer-length (RING_SECONDS) earlier playing underneath the correct
// signal, sustained for as long as that voice stayed out of bounds. Reproducing it
// needs a render long enough to both (a) wrap the ring buffer and (b) sustain a speed
// with no backlog to draw down, so the affected voice sits clamped near the boundary
// for the whole render rather than just transiently.
test("live-speed-processor does not leak stale ring-buffer content at sustained high speed", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const RING_SECONDS = 6;
  const earlyFreq = 300;
  const laterFreq = 900;
  const switchAt = RING_SECONDS;
  const totalDuration = RING_SECONDS + 7;

  const input = Array.from({ length: Math.round(sampleRate * totalDuration) }, (_, i) => {
    const t = i / sampleRate;
    const freq = t < switchAt ? earlyFreq : laterFreq;
    return 0.8 * Math.sin(2 * Math.PI * freq * t);
  });

  // Speed 3 (max) with nothing buffered up in advance keeps the catch-up clamp engaged
  // for the whole render -- exactly the "sustained high speed" scenario reported -- and
  // maximizes hopIn, which maximizes how far out of bounds the unchecked voice would
  // run before the fix.
  const rendered = new Float32Array(await renderLiveSpeed(page, input, 3, totalDuration + 1));

  // The leak (if any) is intermittent -- only whichever voice currently holds the
  // "more advanced" role runs out of bounds, alternating every ~hopOut -- so scan many
  // short sub-windows deep into the "later" era and take the worst one, rather than
  // diluting a brief burst across one large averaged window.
  const scanStart = switchAt + 2;
  const scanEnd = totalDuration - 0.5;
  const subWindow = 0.03;
  let worstRatio = 0;
  let worstAt = scanStart;
  for (let t = scanStart; t < scanEnd; t += subWindow / 2) {
    const laterEnergy = toneEnergyAt(rendered, sampleRate, laterFreq, t, subWindow);
    const earlyLeakEnergy = toneEnergyAt(rendered, sampleRate, earlyFreq, t, subWindow);
    const ratio = earlyLeakEnergy / Math.max(laterEnergy, 1e-6);
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worstAt = t;
    }
  }

  assert.ok(
    worstRatio < 0.5,
    `expected no window with significant leaked ${earlyFreq}Hz energy from ~${RING_SECONDS}s earlier; worst ratio ${worstRatio.toFixed(2)} at t=${worstAt.toFixed(3)}s`,
  );

  await page.close();
});

test("live-speed-processor preserves pitch across speed changes", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const freq = 440;
  const duration = 3;
  const input = Array.from({ length: Math.round(sampleRate * duration) }, (_, i) => Math.sin((2 * Math.PI * freq * i) / sampleRate));

  const [slow, normal, fast] = await Promise.all([
    renderLiveSpeed(page, input, 0.5, 6),
    renderLiveSpeed(page, input, 1, 3),
    renderLiveSpeed(page, input, 2, 3),
  ]);

  // Skip the processor's brief startup passthrough window and measure well into steady
  // granular playback, where the estimate is stable.
  const slowFreq = estimateFrequency(new Float32Array(slow), sampleRate, 2, 1);
  const normalFreq = estimateFrequency(new Float32Array(normal), sampleRate, 1, 1);
  const fastFreq = estimateFrequency(new Float32Array(fast), sampleRate, 0.5, 0.4);

  for (const [label, measured] of [
    ["slow (0.5x)", slowFreq],
    ["normal (1x)", normalFreq],
    ["fast (2x)", fastFreq],
  ] as const) {
    assert.ok(
      Math.abs(measured - freq) < freq * 0.1,
      `${label} measured pitch ${measured.toFixed(1)}Hz should stay close to the source's ${freq}Hz`,
    );
  }

  await page.close();
});

// EffectsGraph's "link pitch to speed" shift for the live path is driven by this
// reported value rather than the raw requested speed (see EffectsGraph.ts's
// syncLinkedPitch), specifically so it backs off once the live stretcher can no longer
// keep up with a requested speed (no buffered backlog left to draw down) instead of
// continuing to shift pitch by the full amount with no real tempo change behind it.
test("live-speed-processor reports an achievedSpeed that reflects what it can actually deliver", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const input = new Array(Math.round(sampleRate * 6)).fill(0).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 300 * i) / sampleRate));

  // Speed 3 with nothing buffered up in advance has no backlog to draw down, so it
  // should settle near 1 (no real tempo change achievable) even though 3 was requested.
  const achievedAtMaxWithNoBacklog = await renderLiveSpeedAndGetAchievedSpeed(page, input, 3, 5);
  assert.ok(
    achievedAtMaxWithNoBacklog < 1.3,
    `expected achievedSpeed to settle near 1 (no backlog to speed through) at speed 3, got ${achievedAtMaxWithNoBacklog}`,
  );

  // Speed 0.7 has ample buffered history to draw from (RING_SECONDS is 6s, this render
  // is only mildly behind), so it should be able to fully honor the request.
  const achievedAtModerateSlowdown = await renderLiveSpeedAndGetAchievedSpeed(page, input, 0.7, 5);
  assert.ok(
    Math.abs(achievedAtModerateSlowdown - 0.7) < 0.1,
    `expected achievedSpeed to closely track the requested 0.7, got ${achievedAtModerateSlowdown}`,
  );

  await page.close();
});

// Regression test for a real bug: once the backlog budget (MAX_LAG_SECONDS) was used
// up, an earlier version clamped the read position to sit exactly on that boundary --
// which is mathematically indistinguishable from real-time (1x) playback, permanently,
// since a fixed lag means the read position has to advance in lockstep with the write
// head from then on. A sustained slowdown would audibly (and per achievedSpeed)
// snap to and get stuck at speed 1 after several seconds, never providing real
// slowdown again for the rest of the session, even though the user's requested speed
// hadn't changed. The fix (see liveSpeedProcessor.js's findSplice) skips back to a
// *smaller* lag instead of parking on the boundary, trading an audible skip for room
// to keep actually stretching. This renders well past MAX_LAG_SECONDS (5s) of
// sustained 0.5x slowdown and checks recovery: some early skip-driven excursion toward
// 1 is expected, but the *later* reports should be back near 0.5, not stuck at 1.
test("live-speed-processor recovers to keep slowing down after exhausting its backlog budget, instead of locking to 1x", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const freq = 300;
  const input = Array.from({ length: sampleRate }, (_, i) => 0.3 * Math.sin((2 * Math.PI * freq * i) / sampleRate));

  // Production uses a much larger budget (RING_SECONDS/MAX_LAG_SECONDS = 1200s, ~20
  // minutes) so this doesn't have to render 20+ minutes of audio to exercise the same
  // skip-and-recover code path -- override to a small, fast-to-exhaust one instead.
  const maxLagSeconds = 5;
  const skipTargetLagSeconds = 1;
  const renderSeconds = maxLagSeconds + skipTargetLagSeconds + 10; // headroom for at least one full skip-and-recover cycle at 0.5x
  const log = await renderLiveSpeedAndGetAchievedSpeedLog(page, input, 0.5, renderSeconds, {
    ringSeconds: maxLagSeconds + 1,
    maxLagSeconds,
    skipTargetLagSeconds,
  });
  assert.ok(log.length > 10, `expected many achievedSpeed reports over a ${renderSeconds}s render, got ${log.length}`);

  const lastQuarter = log.slice(Math.floor((log.length * 3) / 4));
  const avgLastQuarter = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
  assert.ok(
    avgLastQuarter < 0.75,
    `expected achievedSpeed to have recovered back toward 0.5 well after the first backlog-exhaustion skip, ` +
      `but the last quarter of reports averaged ${avgLastQuarter.toFixed(3)} (full log: ${log.map((v) => v.toFixed(2)).join(", ")})`,
  );

  const stuckAtOne = lastQuarter.every((v) => Math.abs(v - 1) < 0.02);
  assert.ok(!stuckAtOne, `achievedSpeed appears permanently locked at 1 in the last quarter of reports: ${lastQuarter.map((v) => v.toFixed(3))}`);

  // Regression check for a real bug: the skip itself (jumping the read position
  // forward by the whole reclaimed backlog in a single ~60ms grain cycle) was being
  // folded into the achievedSpeed measurement like an ordinary cycle, producing one
  // wildly unrepresentative spike (skip distance / one grain's output time) that the
  // EMA then had to chase back down from -- during which it passed through values
  // wildly outside what any real speed request could produce, including negative ones,
  // and got reported to the main thread (which feeds speedNode.pitch, an AudioParam
  // with its own much narrower valid range) along the way.
  const outOfRange = log.filter((v) => v < 0.05 - 1e-6 || v > 3 + 1e-6);
  assert.deepEqual(
    outOfRange,
    [],
    `achievedSpeed should never leave the processor's own valid speed range [0.05, 3] (a skip corrupting the ` +
      `measurement would show up as values far outside it, including negative): got ${outOfRange.map((v) => v.toFixed(3))}`,
  );

  await page.close();
});

// Regression test for a real bug: nominalBase (the reference point each new grain's
// position is computed from) was built from the *previous* grain's search-adjusted
// `base`, so the WSOLA alignment search's own per-cycle jitter (up to SEARCH_SECONDS,
// a substantial fraction of a slow-speed grain's whole advance) compounded into the
// trajectory itself -- not a one-off nudge, but the achieved tempo audibly wobbling
// cycle to cycle. Separating a clean `idealBase` (unperturbed by the search) from the
// actual, search-adjusted read position fixes this. This checks that achievedSpeed --
// now measured off idealBase -- stays tight around the requested speed instead of
// swinging by tens of percent between consecutive reports.
test("live-speed-processor holds a steady tempo instead of the WSOLA search jittering it cycle to cycle", async () => {
  const page = await browser.newPage();
  await page.goto(URL);
  const sampleRate = 44100;
  const freq = 300;
  const speed = 0.8;
  const input = Array.from({ length: sampleRate * 3 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * freq * i) / sampleRate));

  const log = await renderLiveSpeedAndGetAchievedSpeedLog(page, input, speed, 8);
  // Skip the startup transient (the EMA hasn't converged yet).
  const steady = log.slice(Math.floor(log.length / 3));
  assert.ok(steady.length > 5, `expected several achievedSpeed reports in steady state, got ${steady.length}`);

  const maxDeviation = Math.max(...steady.map((v) => Math.abs(v - speed)));
  assert.ok(
    maxDeviation < 0.05,
    `expected achievedSpeed to stay close to the requested ${speed} once settled (search-induced jitter would show ` +
      `up as swings of tens of percent), but saw a deviation of ${maxDeviation.toFixed(3)}: ${steady.map((v) => v.toFixed(3))}`,
  );

  await page.close();
});

// EffectsGraph sends {type: "reset"} whenever it hands the (permanently-alive)
// liveSpeedNode a fresh engagement -- moving speed below 1x again after being at/above
// 1x, including after a detected track change -- rather than recreating the node (see
// setSpeed()'s live-mode state machine). This confirms the worklet actually
// re-bootstraps on that message instead of resuming wherever the previous engagement
// left off: postMessage can't be scheduled to land at a specific point mid-render in an
// OfflineAudioContext, so this needs a real (wall-clock) AudioContext to genuinely
// reset a *running* node rather than one that hasn't started yet.
// Verified via the actual audio output rather than achievedSpeed: while !started, the
// worklet outputs hard silence (see the startup comment in liveSpeedProcessor.js), so a
// *continuous* oscillator input briefly reading back as true zero right after a reset
// is unambiguous proof the bootstrap sequence re-ran (an already-running, un-reset node
// reading a continuous tone from any position is never exactly zero for a multi-ms
// window) -- a more definitive signal than achievedSpeed, whose convergence rate after
// a reset is harder to pin an exact threshold on.
test("live-speed-processor re-bootstraps cleanly on a reset message mid-stream", async () => {
  const page = await browser.newPage();
  await page.goto(URL);

  const { levelBeforeReset, levelRightAfterReset, levelAfterResuming } = await page.evaluate(
    async ({ workletUrl }) => {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(workletUrl);

      const osc = ctx.createOscillator();
      osc.frequency.value = 300;
      osc.start();

      const node = new AudioWorkletNode(ctx, "live-speed-processor");
      node.parameters.get("speed")!.value = 0.5;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const silence = ctx.createGain();
      silence.gain.value = 0; // exercised for real, just not actually audible
      osc.connect(node);
      node.connect(analyser);
      analyser.connect(silence);
      silence.connect(ctx.destination);

      const timeData = new Float32Array(analyser.fftSize);
      function peakLevel() {
        analyser.getFloatTimeDomainData(timeData);
        let peak = 0;
        for (const s of timeData) peak = Math.max(peak, Math.abs(s));
        return peak;
      }

      // Let it reach steady, audible output before resetting.
      await new Promise((r) => setTimeout(r, 2000));
      const levelBeforeReset = peakLevel();

      node.port.postMessage({ type: "reset" });
      // Comfortably inside the ~60ms silent bootstrap window the reset should have
      // just re-triggered, but late enough that the reset has definitely been applied.
      await new Promise((r) => setTimeout(r, 30));
      const levelRightAfterReset = peakLevel();

      // Long enough to have fully bootstrapped and resumed normal output.
      await new Promise((r) => setTimeout(r, 1000));
      const levelAfterResuming = peakLevel();

      ctx.close();
      return { levelBeforeReset, levelRightAfterReset, levelAfterResuming };
    },
    { workletUrl: WORKLET_URL },
  );

  assert.ok(levelBeforeReset > 0.05, `expected audible output before the reset, got peak level ${levelBeforeReset}`);
  assert.equal(
    levelRightAfterReset,
    0,
    `expected hard silence shortly after the reset (the worklet's silent bootstrap window, reading back a ` +
      `continuous oscillator as exact zero is only possible if the reset actually happened), got peak level ${levelRightAfterReset}`,
  );
  assert.ok(
    levelAfterResuming > 0.05,
    `expected audible output to resume well after the reset, got peak level ${levelAfterResuming}`,
  );

  await page.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";

const PORT = 5184;
const URL = `http://localhost:${PORT}/sidepanel.html`;

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

// This runs against the plain dev server, not a loaded extension, so `chrome.*` is
// undefined — confirming the trimmed-down side-panel UI (everything reused from the web
// app) wires up cleanly without it. It deliberately does NOT click #live-connect-btn:
// that now calls the real getDisplayMedia() Web API (chosen over chrome.tabCapture —
// see liveCapture.ts's comment — since a confirmed Chrome bug means activeTab-gated
// capture APIs don't recognize a side panel's clicks as a user gesture), which is a
// real permission-gated browser picker with no automatable, non-flaky headless outcome.
// That flow is verified manually against real Chrome instead (see AGENTS.md/CLAUDE.md's
// "exercise it in a browser" guidance).
test("side panel renders its trimmed card set and reused controls work", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  await page.goto(URL);
  await page.waitForSelector("#library-list .library-chip");

  const presentIds = await page.evaluate(() =>
    ["live-card", "transport-card", "speed-card", "eq-card", "fx-chain-card", "presets-card", "library-sidebar"].filter(
      (id) => document.getElementById(id) !== null,
    ),
  );
  assert.deepEqual(
    presentIds,
    ["live-card", "transport-card", "speed-card", "eq-card", "fx-chain-card", "presets-card", "library-sidebar"],
    "all reused cards plus the new live-tab card should be present",
  );

  const droppedIds = await page.evaluate(() =>
    ["loader-card", "capture-card", "slicer-card"].filter((id) => document.getElementById(id) !== null),
  );
  assert.deepEqual(droppedIds, [], "file-loading/old-capture/slicer cards should not be present in the side panel");

  // Exercise a few reused controls (volume, speed, EQ, adding an FX module) to confirm
  // their wiring survives being hosted in sidepanel.html instead of index.html.
  await page.evaluate(() => {
    const volume = document.getElementById("volume") as HTMLInputElement;
    volume.value = "50";
    volume.dispatchEvent(new Event("input", { bubbles: true }));

    const speed = document.getElementById("speed") as HTMLInputElement;
    speed.value = "1.5";
    speed.dispatchEvent(new Event("input", { bubbles: true }));

    const lowCut = document.getElementById("low-cut") as HTMLInputElement;
    lowCut.value = "0.3";
    lowCut.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('.library-chip[data-module-type="drive"]');
  await page.waitForTimeout(200);
  const chainCardCount = await page.evaluate(() => document.querySelectorAll("#fx-chain-list .chain-card").length);
  assert.equal(chainCardCount, 1, "clicking a library chip should add one FX chain card");

  assert.deepEqual(errors, [], "no console or page errors should occur while loading and exercising the reused controls");

  await page.close();
});

// getDisplayMedia's real tab-picker dialog has no automatable, non-flaky headless
// outcome (see the comment above) -- but connectLiveStream() just needs *a*
// MediaStream, so stubbing getDisplayMedia to hand back a synthetic one (an oscillator
// routed into a MediaStreamAudioDestinationNode) exercises the exact same live-capture
// wiring (liveCapture.ts -> liveStreamPanel.ts -> EffectsGraph.connectLiveStream) a real
// tab share would, without needing the picker itself.
test("connecting to a live (synthetic) stream wires up cleanly and Speed responds without errors", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  await page.addInitScript(() => {
    // @ts-expect-error -- overriding the real API for the test, not typed to match it exactly.
    navigator.mediaDevices.getDisplayMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });

  await page.goto(URL);
  await page.waitForSelector("#live-connect-btn");

  await page.click("#live-connect-btn");
  await page.waitForSelector("#live-track-info:not([hidden])", { timeout: 5000 });
  const connectedText = await page.textContent("#live-connect-btn");
  assert.equal(connectedText, "■ Disconnect");

  // Move Speed (and toggle link-pitch) while live-connected -- this is exactly the path
  // that used to only shift pitch instead of actually changing tempo.
  await page.evaluate(() => {
    const speed = document.getElementById("speed") as HTMLInputElement;
    speed.value = "0.5";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
    const linkPitch = document.getElementById("link-pitch") as HTMLInputElement;
    linkPitch.checked = true;
    linkPitch.dispatchEvent(new Event("change", { bubbles: true }));
    speed.value = "2";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(200);

  await page.click("#live-connect-btn");
  await page.waitForSelector("#live-track-info[hidden]", { state: "attached", timeout: 5000 });
  const disconnectedText = await page.textContent("#live-connect-btn");
  assert.equal(disconnectedText, "⏺ Connect to This Tab");

  assert.deepEqual(errors, [], "no console or page errors should occur while connecting live, adjusting Speed, and disconnecting");

  await page.close();
});

// EffectsGraph's live-mode state machine (raw passthrough at speed >= 1x, buffered
// stretcher only below 1x after a deliberate wait) is private, wiring-only state with
// no direct DOM hook -- but its onLiveSpeedStatus callback drives the status line's
// text (see liveStreamPanel.ts), so that text is an honest, user-facing window into
// which mode is actually active. Verifying through it exercises the real callback wiring
// end to end rather than reaching into EffectsGraph's internals.
test("live status text reflects raw/pitch-only/buffered-slowdown modes as speed changes", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  await page.addInitScript(() => {
    // @ts-expect-error -- overriding the real API for the test, not typed to match it exactly.
    navigator.mediaDevices.getDisplayMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 440;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });

  await page.goto(URL);
  await page.waitForSelector("#live-connect-btn");
  await page.click("#live-connect-btn");
  await page.waitForSelector("#live-track-info:not([hidden])", { timeout: 5000 });

  const statusText = () => page.textContent("#live-status");

  // Freshly connected, default speed 1x: raw passthrough, no pitch shift.
  await page.waitForFunction(() => document.getElementById("live-status")?.textContent?.includes("normal speed"), {
    timeout: 2000,
  });

  // Speed > 1x: stays on the raw stream, pitch-only -- should never mention buffering.
  await page.evaluate(() => {
    const speed = document.getElementById("speed") as HTMLInputElement;
    speed.value = "1.8";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById("live-status")?.textContent?.includes("pitch raised"), {
    timeout: 2000,
  });
  assert.ok(!(await statusText())?.includes("Buffering"), "speed > 1x should never engage the buffered stretcher");

  // Speed < 1x: engages the stretcher, but audibly still raw for the engage delay.
  await page.evaluate(() => {
    const speed = document.getElementById("speed") as HTMLInputElement;
    speed.value = "0.5";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.ok((await statusText())?.includes("Buffering"), "dropping below 1x should immediately show the buffering status");

  // After the engage delay (LIVE_SLOW_ENGAGE_DELAY_MS = 2500), it should hand off to the
  // buffered, slowed status.
  await page.waitForFunction(() => document.getElementById("live-status")?.textContent?.includes("playing slowed"), {
    timeout: 4000,
  });

  // Back to >= 1x should drop the buffered path immediately (no waiting to catch up).
  await page.evaluate(() => {
    const speed = document.getElementById("speed") as HTMLInputElement;
    speed.value = "1";
    speed.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById("live-status")?.textContent?.includes("normal speed"), {
    timeout: 2000,
  });

  await page.click("#live-connect-btn");
  await page.waitForSelector("#live-track-info[hidden]", { state: "attached", timeout: 5000 });

  assert.deepEqual(errors, [], "no console or page errors should occur across the raw/pitch-only/buffered-slowdown transitions");

  await page.close();
});

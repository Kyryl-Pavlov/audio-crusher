import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser } from "playwright";

const PORT = 5183;
const URL = `http://localhost:${PORT}/`;

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

test("adding every module type renders a card and produces no console/page errors", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  await page.goto(URL);
  await page.waitForSelector("#library-list .library-chip");

  const types = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("#library-list .library-chip")).map(
      (c) => c.dataset.moduleType,
    ),
  );
  assert.equal(types.length, 28, "expected all 28 module types to be listed in the library sidebar");

  for (const type of types) {
    await page.click(`.library-chip[data-module-type="${type}"]`);
  }
  await page.waitForTimeout(200);

  const cardCount = await page.evaluate(() => document.querySelectorAll("#fx-chain-list .chain-card").length);
  assert.equal(cardCount, types.length, "one chain card should render per module added");

  // Exercise every card's first slider/checkbox/select so each module's setter path runs.
  await page.evaluate(() => {
    for (const card of Array.from(document.querySelectorAll<HTMLElement>("#fx-chain-list .chain-card"))) {
      const range = card.querySelector<HTMLInputElement>('input[type="range"]');
      if (range) {
        range.value = String(Number(range.max) * 0.7);
        range.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const checkbox = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const select = card.querySelector("select");
      if (select && select.options.length > 1) {
        select.selectedIndex = select.selectedIndex === 0 ? 1 : 0;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  const toRemove = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("#fx-chain-list .chain-card"))
      .slice(0, 5)
      .map((c) => c.dataset.instanceId),
  );
  for (const id of toRemove) {
    await page.click(`.chain-card[data-instance-id="${id}"] .remove-btn`);
  }
  await page.waitForTimeout(200);

  const afterRemoveCount = await page.evaluate(() => document.querySelectorAll("#fx-chain-list .chain-card").length);
  assert.equal(afterRemoveCount, types.length - toRemove.length, "removed cards should disappear from both DOM and graph");

  assert.deepEqual(errors, [], "no console or page errors should occur while building/tearing down the FX chain");

  await page.close();
});

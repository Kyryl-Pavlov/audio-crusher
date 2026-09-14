import type { EffectsGraph } from "../audio/EffectsGraph";
import {
  connectPanelClosePort,
  getActiveTab,
  getTabTitle,
  setTabMuted,
  startLiveTabCapture,
  type LiveCapture,
} from "../extension/liveCapture";
import { $ } from "../utils/dom";
import type { Transport } from "./transport";

// YouTube/YouTube Music update document.title per track via SPA navigation (no page
// load, no tab-activation event) as the user skips through a queue, so the captured
// tab's title has to be re-polled on a timer rather than read once at connect time.
const TITLE_POLL_INTERVAL_MS = 1500;

/** Wires the side panel's "Connect to This Tab" card: captures a tab's audio live via
 *  getDisplayMedia, mutes that tab so its native output doesn't play alongside the
 *  FX-processed signal, and feeds the stream straight into the FX chain — in place of
 *  the file-loading/record-then-trim flows the web app uses. */
export function createLiveStreamPanel(graph: EffectsGraph, transport: Transport): void {
  const connectBtn = $<HTMLButtonElement>("live-connect-btn");
  const status = $<HTMLParagraphElement>("live-status");
  const trackInfo = $<HTMLDivElement>("live-track-info");
  const trackName = $<HTMLElement>("live-track-name");

  let activeCapture: LiveCapture | null = null;
  let mutedTabId: number | null = null;
  let titlePollId: ReturnType<typeof setInterval> | null = null;
  // Lets the background script unmute the tab on its own if the panel closes while
  // still connected — see connectPanelClosePort()'s comment for why that can't be done
  // from here with a pagehide/unload handler instead.
  const closePort = connectPanelClosePort();

  /** Mirrors EffectsGraph's live-mode state machine (see setSpeed()'s comment there) so
   *  the user can tell what's actually happening — raw passthrough, waiting out the
   *  buffering delay, or genuinely playing slowed — instead of one static "connected"
   *  sentence for the whole session. */
  function updateLiveSpeedStatus(mode: "raw" | "engaging" | "slow", rate: number) {
    if (mode === "engaging") {
      status.textContent = "Buffering — slowed playback starts in a moment…";
      return;
    }
    if (mode === "slow") {
      status.textContent = `Capturing audio — playing slowed at ${rate.toFixed(2)}×.`;
      return;
    }
    if (rate > 1) {
      status.textContent = `Capturing audio — pitch raised to ${rate.toFixed(2)}× (tempo unchanged).`;
      return;
    }
    status.textContent = "Capturing audio — streaming live at normal speed.";
  }

  function showConnected(label: string) {
    connectBtn.textContent = "■ Disconnect";
    connectBtn.classList.add("active");
    trackName.textContent = label;
    trackInfo.hidden = false;
    // Status text from here on is owned by updateLiveSpeedStatus (wired in connect()
    // before graph.connectLiveStream() runs, so it's already receiving updates by now).
  }

  function showDisconnected() {
    connectBtn.textContent = "⏺ Connect to This Tab";
    connectBtn.classList.remove("active");
    trackInfo.hidden = true;
  }

  function startTitlePolling(tabId: number) {
    titlePollId = setInterval(() => {
      void getTabTitle(tabId).then((title) => {
        if (!title || title === trackName.textContent) return;
        trackName.textContent = title;
      });
    }, TITLE_POLL_INTERVAL_MS);
  }

  function stopTitlePolling() {
    if (titlePollId === null) return;
    clearInterval(titlePollId);
    titlePollId = null;
  }

  function disconnect() {
    const capture = activeCapture;
    activeCapture = null;
    capture?.stop();
    graph.onLiveSpeedStatus = null;
    graph.disconnectLiveStream();
    transport.setLiveMode(false);
    showDisconnected();
    stopTitlePolling();

    if (mutedTabId !== null) {
      void setTabMuted(mutedTabId, false);
      mutedTabId = null;
      closePort?.notifyMutedTab(null);
    }
  }

  async function connect() {
    connectBtn.disabled = true;
    status.textContent = "Pick this tab in the browser's share dialog and enable “Share tab audio”…";
    try {
      const tab = await getActiveTab();
      const capture = await startLiveTabCapture();
      activeCapture = capture;
      // Wired before connectLiveStream() so it's already in place for that call's own
      // internal setSpeed() resync, which fires it immediately with the starting mode.
      graph.onLiveSpeedStatus = updateLiveSpeedStatus;
      graph.connectLiveStream(capture.stream);
      transport.setLiveMode(true);
      showConnected(tab?.title ?? "this tab");

      if (tab?.id !== undefined) {
        mutedTabId = tab.id;
        void setTabMuted(mutedTabId, true);
        closePort?.notifyMutedTab(mutedTabId);
        startTitlePolling(mutedTabId);
      }

      // The browser's own "Stop sharing" bar, or the captured tab closing/navigating,
      // ends the track out from under us — treat that the same as clicking Disconnect
      // so the UI doesn't stay stuck "connected" to a dead stream.
      void capture.ended.then(() => {
        if (activeCapture !== capture) return; // already disconnected via the button
        disconnect();
        status.textContent = "The capture ended (tab closed, navigated, or sharing was stopped).";
      });
    } catch (err) {
      console.error(err);
      status.textContent = err instanceof Error ? err.message : "Could not connect to this tab.";
    } finally {
      connectBtn.disabled = false;
    }
  }

  connectBtn.addEventListener("click", () => {
    if (activeCapture) {
      disconnect();
      status.textContent = "";
    } else {
      void connect();
    }
  });
}

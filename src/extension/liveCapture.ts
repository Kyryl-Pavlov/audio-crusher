export interface LiveCapture {
  readonly stream: MediaStream;
  /** Resolves once the capture ends — e.g. the browser's own "Stop sharing" bar was
   *  used, or the captured tab closed/navigated. Reading this never itself stops the
   *  capture (unlike stop()). */
  readonly ended: Promise<void>;
  stop(): void;
}

/** Live-captures a tab's audio via the standard getDisplayMedia Web API — deliberately
 *  NOT chrome.tabCapture: a confirmed Chrome platform bug
 *  (https://issues.chromium.org/issues/40926394) means activeTab-gated capture APIs
 *  don't recognize a side panel's button clicks as a valid user gesture, so
 *  chrome.tabCapture.capture() reliably fails from here even on a direct click handler.
 *  getDisplayMedia isn't gated by activeTab at all, at the cost of its own tab-picker
 *  dialog on each connect — same mechanism as src/audio/tabCapture.ts's existing
 *  record-then-trim flow, but handed straight to the FX chain live with no
 *  MediaRecorder/Blob step. */
export async function startLiveTabCapture(): Promise<LiveCapture> {
  // Chrome only offers a "share tab audio" checkbox when video is requested too; the
  // video track is discarded immediately since only the audio is needed here.
  // Leaving audio constraints unspecified lets Chrome default echoCancellation/
  // noiseSuppression/autoGainControl to on, which routes the track through its
  // voice-call APM pipeline — that pipeline is tuned for narrowband speech, so music
  // comes out mono-ish, dulled, and dynamically squashed (reads to the ear like a low
  // bitrate even though this path never encodes anything). Explicitly disabling them
  // keeps the tab's original stereo signal untouched end to end.
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
  });
  displayStream.getVideoTracks().forEach((t) => t.stop());

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    audioTracks.forEach((t) => t.stop());
    throw new Error('No audio was shared — pick the tab playing audio and enable "Share tab audio" in the dialog.');
  }

  const stream = new MediaStream(audioTracks);
  let stopping = false;
  const stopped = new Promise<void>((resolve) => {
    audioTracks[0].addEventListener("ended", () => resolve());
  });

  const stop = () => {
    if (stopping) return;
    stopping = true;
    stream.getTracks().forEach((t) => t.stop());
  };

  return { stream, ended: stopped, stop };
}

/** Looks up the panel's active tab — used both for the captured-tab title shown once
 *  connected and to know which tab to mute/unmute. Requires the "tabs" permission (see
 *  manifest.json): without it, chrome.tabs.query() only returns title/url for a tab the
 *  extension currently holds activeTab access to, which a side panel loses as soon as
 *  the user switches away from the tab that was active when the panel was opened —
 *  "tabs" makes the lookup reliable regardless of that timing. Returns null outside an
 *  extension context (no chrome.* guarantee here is load-bearing for the core capture
 *  flow above). */
export async function getActiveTab(): Promise<{ id: number | undefined; title: string | undefined } | null> {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, title: tab.title } : null;
  } catch {
    return null;
  }
}

/** Re-reads a specific tab's current title by id — used to poll the captured tab while
 *  connected, since YouTube/YouTube Music update document.title per track via SPA
 *  navigation without ever firing a tab-activation event the panel could listen for.
 *  Returns undefined if the tab's gone (closed) or outside an extension context;
 *  callers should just skip that update rather than treat it as fatal. */
export async function getTabTitle(tabId: number): Promise<string | undefined> {
  if (typeof chrome === "undefined" || !chrome.tabs) return undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title;
  } catch {
    return undefined;
  }
}

/** Mutes/unmutes a specific tab — this is what stands in for chrome.tabCapture's
 *  automatic "the captured tab goes silent" behavior, since getDisplayMedia doesn't do
 *  that itself. chrome.tabs.update() isn't gated by the same broken activeTab-gesture
 *  check as the capture APIs above, so this is expected to work reliably from the side
 *  panel. Failures are logged, not thrown — losing the mute shouldn't block the (more
 *  important) live-audio connection itself. */
export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.tabs) return;
  try {
    await chrome.tabs.update(tabId, { muted });
  } catch (err) {
    console.error(err);
  }
}

export interface PanelClosePort {
  /** Tells the background script which tab is currently muted for live capture, or
   *  null once it's been unmuted normally (via Disconnect). */
  notifyMutedTab(tabId: number | null): void;
}

/** Backs notifyMutedTab(): opens a port to the background script only while a tab is
 *  actually muted, so it can revert that tab's audio if the side panel closes before
 *  the user disconnects normally. chrome.sidePanel has no onClose event; a port's
 *  onDisconnect firing in the background script (see background.ts) is the standard
 *  stand-in, since it fires reliably whenever the panel's document goes away (closed,
 *  reloaded, or navigated) — unlike a beforeunload/pagehide handler in the panel
 *  itself, which has no time to finish an async chrome.tabs.update() call before the
 *  document is torn down.
 *
 *  The port must carry its own onDisconnect listener even on this side: without one,
 *  a connect() that can't reach the background script (e.g. a stale panel left open
 *  across an extension reload) logs an "Unchecked runtime.lastError" warning, and the
 *  next postMessage() on that already-dead port throws. Reading chrome.runtime.lastError
 *  inside the listener is what silences the former; nulling out the port reference is
 *  what avoids the latter. */
export function connectPanelClosePort(): PanelClosePort | null {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return null;
  let port: chrome.runtime.Port | null = null;

  return {
    notifyMutedTab(tabId) {
      if (tabId === null) {
        port?.disconnect();
        port = null;
        return;
      }
      if (!port) {
        port = chrome.runtime.connect({ name: "sidepanel" });
        port.onDisconnect.addListener(() => {
          void chrome.runtime.lastError;
          port = null;
        });
      }
      try {
        port.postMessage({ mutedTabId: tabId });
      } catch (err) {
        console.error(err);
        port = null;
      }
    },
  };
}

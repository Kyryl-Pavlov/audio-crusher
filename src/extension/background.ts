chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// chrome.sidePanel has no onClose event, so the panel opens a long-lived port
// (see connectPanelClosePort() in liveCapture.ts) purely so this listener's
// onDisconnect fires when the panel goes away — closed, reloaded, or the side panel
// swapped to a different extension. Without this, muting a tab for live capture
// (setTabMuted in liveCapture.ts) would strand it muted forever if the user closes
// the panel instead of clicking Disconnect, since nothing else would ever unmute it.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") return;
  let mutedTabId: number | null = null;
  port.onMessage.addListener((msg: { mutedTabId: number | null }) => {
    mutedTabId = msg?.mutedTabId ?? null;
  });
  port.onDisconnect.addListener(() => {
    if (mutedTabId !== null) {
      chrome.tabs.update(mutedTabId, { muted: false }).catch(console.error);
    }
  });
});

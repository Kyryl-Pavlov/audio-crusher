import type { EffectsGraph } from "../audio/EffectsGraph";
import { startTabCapture, MAX_CAPTURE_BYTES, type TabCapture } from "../audio/tabCapture";
import { trimAudioBuffer } from "../audio/trimBuffer";
import { $ } from "../utils/dom";
import { formatTime } from "../utils/format";
import { WaveformTrimView } from "./waveformTrimView";

/** Wires tab-audio capture: the capture button/timer and the trim panel used to crop a capture before loading it. */
export function createTabCapturePanel(graph: EffectsGraph, onLoaded: (buffer: AudioBuffer, label: string) => void): void {
  const captureBtn = $<HTMLButtonElement>("capture-btn");
  const captureElapsed = $<HTMLSpanElement>("capture-elapsed");
  const captureStatus = $<HTMLParagraphElement>("capture-status");

  const captureTrimPanel = $<HTMLDivElement>("capture-trim");
  const trimStartValue = $<HTMLSpanElement>("trim-start-value");
  const trimEndValue = $<HTMLSpanElement>("trim-end-value");
  const trimLoadBtn = $<HTMLButtonElement>("trim-load-btn");
  const trimDurationLabel = $<HTMLSpanElement>("trim-duration-label");
  const waveformTrim = new WaveformTrimView($<HTMLCanvasElement>("trim-waveform-canvas"));

  const MAX_CAPTURE_GB = (MAX_CAPTURE_BYTES / (1024 * 1024 * 1024)).toFixed(0);

  let activeCapture: TabCapture | null = null;
  let captureStartedAt = 0;
  let captureTimerHandle: number | null = null;
  let pendingCaptureBuffer: AudioBuffer | null = null;
  let trimRange = { startSec: 0, endSec: 0 };

  function startCaptureTimer() {
    captureStartedAt = performance.now();
    captureElapsed.hidden = false;
    captureElapsed.textContent = "0:00";
    captureTimerHandle = window.setInterval(() => {
      captureElapsed.textContent = formatTime((performance.now() - captureStartedAt) / 1000);
    }, 250);
  }

  function stopCaptureTimer() {
    if (captureTimerHandle !== null) {
      clearInterval(captureTimerHandle);
      captureTimerHandle = null;
    }
    captureElapsed.hidden = true;
  }

  function hideTrimPanel() {
    captureTrimPanel.hidden = true;
    pendingCaptureBuffer = null;
    waveformTrim.clear();
  }

  waveformTrim.onChange = (range) => {
    trimRange = range;
    trimStartValue.textContent = formatTime(range.startSec);
    trimEndValue.textContent = formatTime(range.endSec);
    trimDurationLabel.textContent = `Selected: ${formatTime(Math.max(0, range.endSec - range.startSec))}`;
  };

  function showTrimPanel(buffer: AudioBuffer, limitReached: boolean) {
    pendingCaptureBuffer = buffer;
    captureTrimPanel.hidden = false;
    waveformTrim.setBuffer(buffer);
    captureStatus.textContent = limitReached
      ? `Stopped automatically — reached the ${MAX_CAPTURE_GB}GB capture limit. Trim and load below.`
      : "Capture ready — drag the handles to trim, then load it.";
  }

  trimLoadBtn.addEventListener("click", () => {
    if (!pendingCaptureBuffer) return;
    const { startSec, endSec } = trimRange;
    const isFullRange = startSec <= 0 && endSec >= pendingCaptureBuffer.duration;
    const buffer = isFullRange ? pendingCaptureBuffer : trimAudioBuffer(graph.ctx, pendingCaptureBuffer, startSec, endSec);
    const trackBuffer = graph.loadAudioBuffer(buffer);
    onLoaded(trackBuffer, `Captured audio (${formatTime(trackBuffer.duration)})`);
    hideTrimPanel();
    captureStatus.textContent = "";
  });

  async function finishCapture(capture: TabCapture) {
    captureBtn.disabled = true;
    captureStatus.textContent = "Decoding captured audio…";
    try {
      const blob = await capture.stop();
      const buffer = await graph.ctx.decodeAudioData(await blob.arrayBuffer());
      showTrimPanel(buffer, capture.limitReached);
    } catch (err) {
      console.error(err);
      captureStatus.textContent = "Could not decode the captured audio.";
    } finally {
      captureBtn.disabled = false;
    }
  }

  captureBtn.addEventListener("click", async () => {
    if (activeCapture) {
      const capture = activeCapture;
      activeCapture = null;
      stopCaptureTimer();
      captureBtn.textContent = "⏺ Capture Tab Audio";
      captureBtn.classList.remove("active");
      await finishCapture(capture);
      return;
    }

    hideTrimPanel();
    try {
      captureStatus.textContent = 'Pick the YouTube tab and enable "Share tab audio"…';
      activeCapture = await startTabCapture();
      captureStatus.textContent = "Capturing… play the track now.";
      captureBtn.textContent = "■ Stop & Use Recording";
      captureBtn.classList.add("active");
      startCaptureTimer();
      // If the user ends the share via the browser's own "Stop sharing" bar instead of
      // this button, finalize the recording the same way clicking Stop would.
      const capture = activeCapture;
      void capture.ended.then(() => {
        if (activeCapture !== capture) return; // already finished via the button
        activeCapture = null;
        stopCaptureTimer();
        captureBtn.textContent = "⏺ Capture Tab Audio";
        captureBtn.classList.remove("active");
        void finishCapture(capture);
      });
    } catch (err) {
      console.error(err);
      captureStatus.textContent = err instanceof Error ? err.message : "Capture was cancelled or denied.";
    }
  });
}

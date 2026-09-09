export const MAX_CAPTURE_BYTES = 1024 * 1024 * 1024; // 1 GiB

export interface TabCapture {
  readonly recording: boolean;
  /** True once recording was stopped automatically for hitting MAX_CAPTURE_BYTES,
   *  rather than via stop() or the browser's "Stop sharing" control. */
  readonly limitReached: boolean;
  /** Resolves once recording has ended and the Blob is finalized — whether stop() was
   *  called explicitly, the browser's own "Stop sharing" control ended the share, or the
   *  size limit was hit. Reading this never itself stops the capture (unlike stop()). */
  readonly ended: Promise<Blob>;
  stop(): Promise<Blob>;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** Captures audio from a tab/window/screen the user picks in the browser's share dialog
 *  (e.g. a YouTube tab with "Share tab audio" checked), recording it into a Blob until
 *  stop() is called, the user ends the share from the browser's own UI, or the recording
 *  reaches MAX_CAPTURE_BYTES (an unbounded capture would otherwise grow forever in memory). */
export async function startTabCapture(): Promise<TabCapture> {
  // Chrome only offers a "share tab audio" checkbox when video is requested too; the
  // video track is discarded immediately since only the audio is needed here.
  const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  displayStream.getVideoTracks().forEach((t) => t.stop());

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    audioTracks.forEach((t) => t.stop());
    throw new Error('No audio was shared — pick the YouTube tab and enable "Share tab audio" in the dialog.');
  }

  const audioStream = new MediaStream(audioTracks);
  const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
  // Chrome's default Opus bitrate for captured streams is noticeably lower than what
  // Opus can do; 256kbps is comfortably above the point of audible difference for music.
  const recorder = new MediaRecorder(audioStream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 256_000 });
  const chunks: Blob[] = [];
  let totalBytes = 0;
  let limitReached = false;
  let stopping = false;

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
  });

  const stop = () => {
    if (!stopping) {
      stopping = true;
      if (recorder.state !== "inactive") recorder.stop();
      audioStream.getTracks().forEach((t) => t.stop());
    }
    return stopped;
  };

  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    chunks.push(e.data);
    totalBytes += e.data.size;
    if (totalBytes >= MAX_CAPTURE_BYTES && !stopping) {
      limitReached = true;
      stop();
    }
  };

  recorder.start(1000);

  // The browser's own "Stop sharing" bar ends the track without going through our UI —
  // treat that the same as clicking Stop so the recording still finalizes.
  audioTracks[0].addEventListener("ended", stop);

  return {
    get recording() {
      return recorder.state === "recording";
    },
    get limitReached() {
      return limitReached;
    },
    ended: stopped,
    stop,
  };
}

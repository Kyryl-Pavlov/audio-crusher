import type { EffectsGraph } from "../audio/EffectsGraph";
import { $ } from "../utils/dom";
import { formatTime, fmtSpeed } from "../utils/format";
import { PeakMeter } from "./levelMeter";

export interface Transport {
  /** Resets play/reverse/loop/seek/time UI for a freshly loaded track. */
  onTrackLoaded(buffer: AudioBuffer): void;
  /** Starts playback (updating the play button) if not already playing — used by the slicer's seek-to-cue. */
  ensurePlaying(): void;
  /** Sets playback speed (slider, label, and graph) — used by presets. */
  setSpeed(rate: number): void;
  /** Sets whether pitch is linked to speed (checkbox and graph) — used by presets. */
  setLinkPitch(enabled: boolean): void;
  /** Current speed value — used to snapshot a custom preset. */
  getSpeed(): number;
  /** Current link-pitch state — used to snapshot a custom preset. */
  getLinkPitch(): boolean;
  tick(): void;
}

/** Wires playback transport: play/pause, seek bar, volume, jog wheel, keyboard shortcuts, speed/pitch-link. */
export function createTransport(graph: EffectsGraph): Transport {
  const playBtn = $<HTMLButtonElement>("play-btn");
  const reverseBtn = $<HTMLButtonElement>("reverse-btn");
  const loopBtn = $<HTMLButtonElement>("loop-btn");
  const seek = $<HTMLInputElement>("seek");
  const timeCurrent = $<HTMLSpanElement>("time-current");
  const timeDuration = $<HTMLSpanElement>("time-duration");
  const volume = $<HTMLInputElement>("volume");
  const jogWheel = $<HTMLDivElement>("jog-wheel");
  const jogWheelDial = $<HTMLDivElement>("jog-wheel-dial");

  const speed = $<HTMLInputElement>("speed");
  const speedValue = $<HTMLSpanElement>("speed-value");
  const linkPitch = $<HTMLInputElement>("link-pitch");

  const volumeLevelBuffer = new Float32Array(graph.masterMeterSize);
  const volumeMeter = new PeakMeter($<HTMLDivElement>("volume-meter-fill"));

  let seeking = false;

  function togglePlay() {
    if (graph.isPlaying) {
      graph.pause();
      playBtn.textContent = "▶";
    } else {
      graph.play();
      playBtn.textContent = "⏸";
    }
  }

  playBtn.addEventListener("click", togglePlay);

  function nudgeTime(deltaSec: number) {
    if (graph.duration <= 0) return;
    const t = Math.max(0, Math.min(graph.duration, graph.getCurrentTime() + deltaSec));
    graph.seek(t);
    seek.value = String(Math.floor(t * 1000));
    timeCurrent.textContent = formatTime(t);
  }

  // Base nudge step; Shift speeds it up, Ctrl slows it down for finer control.
  // The same three speeds drive both the arrow keys and the jog wheel's drag
  // sensitivity below, so a modifier held during either feels the same.
  const JOG_STEP_SECONDS = 2;
  const JOG_STEP_SECONDS_FAST = 3;
  const JOG_STEP_SECONDS_FINE = 1;

  function stepSecondsFor(ctrlKey: boolean, shiftKey: boolean): number {
    if (ctrlKey) return JOG_STEP_SECONDS_FINE;
    if (shiftKey) return JOG_STEP_SECONDS_FAST;
    return JOG_STEP_SECONDS;
  }

  // Winding the wheel or the arrow keys should be audible even while the track
  // is stopped — like scratching a paused turntable — so a scrub session forces
  // playback on for its duration, then restores whatever state it found.
  let scrubActive = false;
  let scrubWasPlaying = false;

  function beginScrub() {
    if (scrubActive || graph.duration <= 0) return;
    scrubActive = true;
    scrubWasPlaying = graph.isPlaying;
    if (!scrubWasPlaying) {
      graph.play();
      playBtn.textContent = "⏸";
    }
  }

  function endScrub() {
    if (!scrubActive) return;
    scrubActive = false;
    if (!scrubWasPlaying) {
      graph.pause();
      playBtn.textContent = "▶";
    }
  }

  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    const isEditable =
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable || tag === "BUTTON";
    if (isEditable) return;

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (!e.repeat) beginScrub();
      const step = stepSecondsFor(e.ctrlKey, e.shiftKey);
      nudgeTime(e.key === "ArrowRight" ? step : -step);
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") endScrub();
  });

  // --- jog wheel (drag-driven scratch: spin speed & direction drive playback rate) ---

  // Rotation is purely a function of playback position — one full turn of the
  // wheel corresponds to this many seconds of audio — so the dial always reflects
  // wherever the track actually is, whether it moved via drag, arrow keys, the
  // seek bar, or normal playback.
  const JOG_SECONDS_PER_REVOLUTION = 6;

  // Spinning the wheel at roughly this angular speed plays back at normal (1x)
  // speed; slower spins scale the rate down towards JOG_SCRUB_MIN_RATE and
  // faster spins scale it up towards JOG_SCRUB_MAX_RATE, while reversing spin
  // direction flips into reverse playback — the same way a real turntable's
  // platter just follows whatever speed and direction your hand turns it.
  const JOG_SCRUB_REFERENCE_DEG_PER_SEC = 180;
  const JOG_SCRUB_MIN_RATE = 0.05;
  const JOG_SCRUB_MAX_RATE = 3;

  function updateJogWheelDial() {
    const deg = (graph.getCurrentTime() / JOG_SECONDS_PER_REVOLUTION) * 360;
    jogWheelDial.style.transform = `rotate(${deg}deg)`;
  }

  function angleFromCenter(clientX: number, clientY: number, cx: number, cy: number): number {
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }

  function shortestAngleDelta(fromDeg: number, toDeg: number): number {
    let delta = (toDeg - fromDeg) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  function setReverseUI(enabled: boolean) {
    graph.setReverseEnabled(enabled);
    reverseBtn.classList.toggle("active", enabled);
    reverseBtn.setAttribute("aria-pressed", String(enabled));
  }

  let jogDragging = false;
  let jogLastAngle = 0;
  let jogLastMoveTime = 0;
  // Centre/radius are captured once per drag (not re-measured on every move) so a
  // fast gesture is tracked against a stable reference point instead of drifting
  // with layout reads, and so the dead-zone radius below stays consistent for the
  // whole gesture.
  let jogCenterX = 0;
  let jogCenterY = 0;
  let jogDeadZoneRadius = 0;
  // While dragging, the wheel owns speed/direction/playback (the `seeking` flag
  // above suppresses tick()'s own seek-bar updates) — the Transport only gets
  // control back on release, when everything springs back to whatever speed,
  // direction, and playing state it found: if it was already playing, touching
  // the wheel doesn't interrupt it, it just rides along at whatever rate the
  // spin implies; if it was stopped, it stays silent until the wheel actually
  // moves, then plays only for the duration of the drag.
  let jogWasPlaying = false;
  let jogWasSpeed = 1;
  let jogWasReverse = false;

  jogWheel.addEventListener("pointerdown", (e) => {
    if (graph.duration <= 0) return;
    jogDragging = true;
    seeking = true;
    jogWheel.classList.add("dragging");
    jogWheel.setPointerCapture(e.pointerId);
    const rect = jogWheel.getBoundingClientRect();
    jogCenterX = rect.left + rect.width / 2;
    jogCenterY = rect.top + rect.height / 2;
    // Near the exact centre, a whisker of linear movement swings the angle
    // wildly (the derivative of atan2 blows up as radius -> 0) — points closer
    // in than this are ignored rather than fed into the angle math.
    jogDeadZoneRadius = (rect.width / 2) * 0.2;
    jogLastAngle = angleFromCenter(e.clientX, e.clientY, jogCenterX, jogCenterY);
    jogLastMoveTime = e.timeStamp;
    jogWasPlaying = graph.isPlaying;
    jogWasSpeed = Number(speed.value);
    jogWasReverse = graph.reverse;
  });

  jogWheel.addEventListener("pointermove", (e) => {
    if (!jogDragging) return;
    // Coalesced events replay every raw sample the OS captured since the last
    // frame (touchscreens and high-poll-rate mice report faster than rAF), so a
    // fast spin is measured against its true path instead of the one straight
    // line to wherever the pointer ended up — which is what keeps a quick flick
    // from reading as a slower, wrong-direction turn. Elapsed time, though, is
    // taken once per callback (not per sample): sub-frame samples from some
    // input backends share a timestamp, and dividing by a same-instant delta
    // would either divide by zero or read as an implausible spike.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    let totalDelta = 0;
    for (const sample of samples) {
      const dx = sample.clientX - jogCenterX;
      const dy = sample.clientY - jogCenterY;
      if (Math.hypot(dx, dy) < jogDeadZoneRadius) continue;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      totalDelta += shortestAngleDelta(jogLastAngle, angle);
      jogLastAngle = angle;
    }
    if (totalDelta === 0) return;
    const dtMs = Math.max(1, e.timeStamp - jogLastMoveTime);
    jogLastMoveTime = e.timeStamp;
    if (!graph.isPlaying) graph.play();

    // Clockwise spin (positive delta) is forward, counter-clockwise is reverse —
    // the same convention the old position-nudge used, and how a turntable feels.
    const degPerSec = (totalDelta / dtMs) * 1000;
    const rate = Math.min(
      JOG_SCRUB_MAX_RATE,
      Math.max(JOG_SCRUB_MIN_RATE, Math.abs(degPerSec) / JOG_SCRUB_REFERENCE_DEG_PER_SEC),
    );
    if ((degPerSec < 0) !== graph.reverse) setReverseUI(degPerSec < 0);
    setSpeed(rate);
    playBtn.textContent = graph.isPlaying ? "⏸" : "▶";
  });

  function endJogDrag(e: PointerEvent) {
    if (!jogDragging) return;
    jogDragging = false;
    seeking = false;
    jogWheel.classList.remove("dragging");
    if (jogWheel.hasPointerCapture(e.pointerId)) jogWheel.releasePointerCapture(e.pointerId);
    setSpeed(jogWasSpeed);
    if (jogWasReverse !== graph.reverse) setReverseUI(jogWasReverse);
    if (!jogWasPlaying && graph.isPlaying) graph.pause();
    playBtn.textContent = graph.isPlaying ? "⏸" : "▶";
  }
  jogWheel.addEventListener("pointerup", endJogDrag);
  jogWheel.addEventListener("pointercancel", endJogDrag);

  graph.onEnded = () => {
    playBtn.textContent = "▶";
    // Reflects wherever the *next* play() will resume from — the track start when
    // playing forward, but the track end when playing in reverse.
    const t = graph.getCurrentTime();
    seek.value = String(Math.floor(t * 1000));
    timeCurrent.textContent = formatTime(t);
  };

  loopBtn.addEventListener("click", () => {
    const enabled = !graph.loop;
    graph.setLoopEnabled(enabled);
    loopBtn.classList.toggle("active", enabled);
    loopBtn.setAttribute("aria-pressed", String(enabled));
  });

  reverseBtn.addEventListener("click", () => setReverseUI(!graph.reverse));

  seek.addEventListener("pointerdown", () => (seeking = true));
  seek.addEventListener("input", () => {
    timeCurrent.textContent = formatTime(Number(seek.value) / 1000);
  });
  seek.addEventListener("change", () => {
    graph.seek(Number(seek.value) / 1000);
    seeking = false;
  });

  volume.addEventListener("input", () => graph.setMasterVolume(Number(volume.value) / 100));

  function setSpeed(rate: number) {
    speed.value = String(rate);
    graph.setSpeed(rate);
    speedValue.textContent = fmtSpeed(rate);
  }
  function setLinkPitch(enabled: boolean) {
    linkPitch.checked = enabled;
    graph.setLinkPitchToSpeed(enabled);
  }

  speed.addEventListener("input", () => setSpeed(Number(speed.value)));
  linkPitch.addEventListener("change", () => setLinkPitch(linkPitch.checked));

  return {
    onTrackLoaded(buffer) {
      playBtn.disabled = false;
      playBtn.textContent = "▶";
      reverseBtn.disabled = false;
      reverseBtn.classList.remove("active");
      reverseBtn.setAttribute("aria-pressed", "false");
      loopBtn.disabled = false;
      seek.disabled = false;
      seek.max = String(Math.floor(buffer.duration * 1000));
      seek.value = "0";
      timeDuration.textContent = formatTime(buffer.duration);
      timeCurrent.textContent = "0:00";
      jogWheel.classList.remove("disabled");
      jogWheel.setAttribute("aria-disabled", "false");
    },
    ensurePlaying() {
      if (!graph.isPlaying) {
        graph.play();
        playBtn.textContent = "⏸";
      }
    },
    setSpeed,
    setLinkPitch,
    getSpeed: () => Number(speed.value),
    getLinkPitch: () => linkPitch.checked,
    tick() {
      if (graph.isPlaying && !seeking) {
        const t = graph.getCurrentTime();
        timeCurrent.textContent = formatTime(t);
        seek.value = String(Math.floor(t * 1000));
      }
      updateJogWheelDial();

      graph.readMasterOutputLevel(volumeLevelBuffer);
      volumeMeter.update(volumeLevelBuffer);
    },
  };
}

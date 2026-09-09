export interface SliceMark {
  readonly id: string;
  timeSec: number;
  key: string | null;
}

const WAVE_COLOR = "#57f057";
const MARK_COLOR = "#ffb400";
const MARK_COLOR_DIM = "rgba(255, 180, 0, 0.55)";
const PLAYHEAD_COLOR = "#39ff14";
const MARK_HIT_PX = 8;

// Cycled across marks (by time order) so a row of hot-cue pads reads like a
// real drum machine's individually-lit pads rather than identical buttons.
const PAD_COLORS: readonly { light: string; mid: string; dark: string }[] = [
  { light: "#7fffb0", mid: "#17a83f", dark: "#0c5c22" }, // green
  { light: "#ffd580", mid: "#ffb400", dark: "#a86e00" }, // amber
  { light: "#ff9b9b", mid: "#ff4d4d", dark: "#a11f1f" }, // red
  { light: "#9fd0ff", mid: "#3d94ff", dark: "#1a4fa0" }, // blue
  { light: "#e2b3ff", mid: "#b34dff", dark: "#6a1fa0" }, // purple
  { light: "#9df5ff", mid: "#00c8e0", dark: "#007a8a" }, // cyan
  { light: "#ffcf9e", mid: "#ff8c2a", dark: "#a1520f" }, // orange
  { light: "#ffb3d9", mid: "#ff4da6", dark: "#a01f66" }, // pink
];

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "ContextMenu", "OS", "Escape"]);

const KEY_DISPLAY: Record<string, string> = {
  " ": "SPACE",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function displayKey(key: string): string {
  return KEY_DISPLAY[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${rem}`;
}

function computePeaks(buffer: AudioBuffer, width: number) {
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const samplesPerColumn = buffer.length / width;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * samplesPerColumn);
      const end = Math.min(data.length, Math.max(start + 1, Math.floor((x + 1) * samplesPerColumn)));
      let colMin = ch === 0 ? Infinity : min[x];
      let colMax = ch === 0 ? -Infinity : max[x];
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < colMin) colMin = v;
        if (v > colMax) colMax = v;
      }
      min[x] = colMin === Infinity ? 0 : colMin;
      max[x] = colMax === -Infinity ? 0 : colMax;
    }
  }
  return { min, max };
}

/**
 * A DJ-style hot-cue slicer: draws the loaded track's waveform, lets the user drop an
 * unlimited number of marks on it, bind each mark to a keyboard key, and jump playback
 * to a mark (via onSeek) either by clicking it or pressing its bound key from anywhere
 * on the page.
 */
export class SlicerView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly listEl: HTMLElement;
  private width = 0;
  private height = 0;

  private buffer: AudioBuffer | null = null;
  private peaksMin = new Float32Array(0);
  private peaksMax = new Float32Array(0);
  private duration = 0;
  private playheadSec = 0;

  private marks: SliceMark[] = [];
  private nextMarkId = 1;
  private draggingMarkId: string | null = null;
  private awaitingKeyForMarkId: string | null = null;

  /** Called to jump playback to a mark's time, whether triggered by keyboard or click. */
  onSeek: ((timeSec: number) => void) | null = null;
  /** Called whenever the mark set changes, in case a caller wants to persist it. */
  onMarksChange: ((marks: readonly SliceMark[]) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, listEl: HTMLElement) {
    this.canvas = canvas;
    this.listEl = listEl;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.resize();

    window.addEventListener("resize", () => {
      this.resize();
      if (this.buffer) this.peaks(this.buffer);
      this.draw();
    });
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", () => (this.draggingMarkId = null));
    canvas.addEventListener("pointercancel", () => (this.draggingMarkId = null));
    canvas.addEventListener("contextmenu", (e) => this.onContextMenu(e));

    window.addEventListener("keydown", (e) => this.onKeydown(e));
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private peaks(buffer: AudioBuffer) {
    const { min, max } = computePeaks(buffer, this.width);
    this.peaksMin = min;
    this.peaksMax = max;
  }

  /** Displays a new track's waveform and clears any marks left over from the previous one.
   *  Call only while the canvas is visible (a hidden element measures as 0×0). */
  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    this.duration = buffer.duration;
    this.playheadSec = 0;
    this.marks = [];
    this.nextMarkId = 1;
    this.awaitingKeyForMarkId = null;
    this.resize();
    this.peaks(buffer);
    this.draw();
    this.renderList();
    this.emitMarksChange();
  }

  clear() {
    this.buffer = null;
    this.peaksMin = new Float32Array(0);
    this.peaksMax = new Float32Array(0);
    this.duration = 0;
    this.marks = [];
    this.awaitingKeyForMarkId = null;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.renderList();
  }

  setPlayhead(sec: number) {
    this.playheadSec = sec;
    this.draw();
  }

  get markCount(): number {
    return this.marks.length;
  }

  private emitMarksChange() {
    this.onMarksChange?.(this.marks);
  }

  private timeToX(sec: number): number {
    return this.duration > 0 ? (sec / this.duration) * this.width : 0;
  }

  private xToTime(x: number): number {
    return this.duration > 0 ? Math.max(0, Math.min(this.duration, (x / this.width) * this.duration)) : 0;
  }

  private eventX(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    return Math.max(0, Math.min(this.width, e.clientX - rect.left));
  }

  private markNear(x: number): SliceMark | null {
    let closest: SliceMark | null = null;
    let closestDist = Infinity;
    for (const mark of this.marks) {
      const dist = Math.abs(this.timeToX(mark.timeSec) - x);
      if (dist <= MARK_HIT_PX && dist < closestDist) {
        closest = mark;
        closestDist = dist;
      }
    }
    return closest;
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.buffer) return;
    const x = this.eventX(e);
    const hit = this.markNear(x);
    if (hit) {
      this.draggingMarkId = hit.id;
      this.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    this.addMark(this.xToTime(x));
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.buffer) return;
    const x = this.eventX(e);
    if (!this.draggingMarkId) {
      this.canvas.style.cursor = this.markNear(x) ? "ew-resize" : "crosshair";
      return;
    }
    const mark = this.marks.find((m) => m.id === this.draggingMarkId);
    if (!mark) return;
    mark.timeSec = this.xToTime(x);
    this.draw();
    this.renderList();
    this.emitMarksChange();
  }

  private onContextMenu(e: MouseEvent) {
    if (!this.buffer) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(this.width, e.clientX - rect.left));
    const hit = this.markNear(x);
    if (hit) this.removeMark(hit.id);
  }

  private addMark(timeSec: number) {
    const mark: SliceMark = { id: `mk${this.nextMarkId++}`, timeSec, key: null };
    this.marks.push(mark);
    this.draw();
    this.renderList();
    this.emitMarksChange();
  }

  private removeMark(id: string) {
    this.marks = this.marks.filter((m) => m.id !== id);
    if (this.awaitingKeyForMarkId === id) this.awaitingKeyForMarkId = null;
    this.draw();
    this.renderList();
    this.emitMarksChange();
  }

  private startKeyAssignment(id: string) {
    this.awaitingKeyForMarkId = this.awaitingKeyForMarkId === id ? null : id;
    this.renderList();
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.awaitingKeyForMarkId) {
      if (e.key === "Escape") {
        this.awaitingKeyForMarkId = null;
        this.renderList();
        e.preventDefault();
        return;
      }
      if (MODIFIER_KEYS.has(e.key)) return;
      const key = normalizeKey(e.key);
      const markId = this.awaitingKeyForMarkId;
      // A physical key can only trigger one mark, so stealing it from whichever
      // mark had it before keeps the mapping one-to-one instead of ambiguous.
      this.marks.forEach((m) => {
        if (m.key === key) m.key = null;
      });
      const mark = this.marks.find((m) => m.id === markId);
      if (mark) mark.key = key;
      this.awaitingKeyForMarkId = null;
      this.draw();
      this.renderList();
      this.emitMarksChange();
      e.preventDefault();
      return;
    }

    const target = e.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const key = normalizeKey(e.key);
    const mark = this.marks.find((m) => m.key === key);
    if (mark) {
      e.preventDefault();
      this.onSeek?.(mark.timeSec);
    }
  }

  private drawMarkFlag(x: number, hasKey: boolean) {
    const { ctx, height } = this;
    ctx.strokeStyle = hasKey ? MARK_COLOR : MARK_COLOR_DIM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillStyle = hasKey ? MARK_COLOR : MARK_COLOR_DIM;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 7, 4);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fill();
  }

  private draw() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    if (!this.buffer) return;

    const mid = height / 2;
    for (let x = 0; x < width; x++) {
      const yTop = mid - this.peaksMax[x] * mid;
      const yBottom = mid - this.peaksMin[x] * mid;
      ctx.strokeStyle = WAVE_COLOR;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, Math.min(yTop, mid - 0.5));
      ctx.lineTo(x + 0.5, Math.max(yBottom, mid + 0.5));
      ctx.stroke();
    }

    for (const mark of this.marks) {
      this.drawMarkFlag(this.timeToX(mark.timeSec), mark.key !== null);
    }

    const playX = this.timeToX(this.playheadSec);
    ctx.strokeStyle = PLAYHEAD_COLOR;
    ctx.lineWidth = 1;
    ctx.shadowColor = PLAYHEAD_COLOR;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(playX + 0.5, 0);
    ctx.lineTo(playX + 0.5, height);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private renderList() {
    this.listEl.innerHTML = "";
    const sorted = [...this.marks].sort((a, b) => a.timeSec - b.timeSec);
    sorted.forEach((mark, i) => {
      const row = document.createElement("div");
      row.className = "slicer-mark-row";
      if (this.awaitingKeyForMarkId === mark.id) row.classList.add("awaiting");

      const time = document.createElement("span");
      time.className = "slicer-mark-time";
      time.textContent = formatTime(mark.timeSec);

      const keyBtn = document.createElement("button");
      keyBtn.type = "button";
      keyBtn.className = "slicer-mark-key";
      if (mark.key !== null) keyBtn.classList.add("bound");
      keyBtn.textContent = this.awaitingKeyForMarkId === mark.id ? "PRESS A KEY…" : mark.key !== null ? displayKey(mark.key) : "SET KEY";
      keyBtn.addEventListener("click", () => this.startKeyAssignment(mark.id));

      const goBtn = document.createElement("button");
      goBtn.type = "button";
      goBtn.className = "slicer-mark-go";
      goBtn.textContent = "▶";
      goBtn.title = "Jump here";
      const pad = PAD_COLORS[i % PAD_COLORS.length];
      goBtn.style.setProperty("--pad-light", pad.light);
      goBtn.style.setProperty("--pad-mid", pad.mid);
      goBtn.style.setProperty("--pad-dark", pad.dark);
      goBtn.addEventListener("click", () => this.onSeek?.(mark.timeSec));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "slicer-mark-del";
      delBtn.textContent = "×";
      delBtn.title = "Delete mark";
      delBtn.addEventListener("click", () => this.removeMark(mark.id));

      row.append(time, keyBtn, goBtn, delBtn);
      this.listEl.appendChild(row);
    });
  }
}

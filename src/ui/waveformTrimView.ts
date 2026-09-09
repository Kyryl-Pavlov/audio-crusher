export interface TrimRange {
  startSec: number;
  endSec: number;
}

const WAVE_COLOR = "#57f057";
const WAVE_COLOR_DIM = "rgba(87, 240, 87, 0.25)";
const DISCARD_SHADE = "rgba(0, 0, 0, 0.65)";
const HANDLE_COLOR = "#ffb400";
const HANDLE_HIT_PX = 10;
const MIN_GAP_SEC = 0.1;

/** A DAW-style clip trimmer: draws a static min/max waveform for a whole AudioBuffer and
 *  lets the user drag start/end handles directly on it to select the region to keep. */
export class WaveformTrimView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private buffer: AudioBuffer | null = null;
  private peaksMin = new Float32Array(0);
  private peaksMax = new Float32Array(0);
  private duration = 0;
  private startSec = 0;
  private endSec = 0;
  private dragging: "start" | "end" | null = null;

  onChange: ((range: TrimRange) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.resize();

    window.addEventListener("resize", () => {
      this.resize();
      if (this.buffer) this.computePeaks(this.buffer);
      this.draw();
    });
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", () => (this.dragging = null));
    canvas.addEventListener("pointercancel", () => (this.dragging = null));
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

  get range(): TrimRange {
    return { startSec: this.startSec, endSec: this.endSec };
  }

  /** Displays a new buffer's waveform and resets the trim selection to its full length.
   *  Call only while the canvas is visible (a hidden element measures as 0×0). */
  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    this.duration = buffer.duration;
    this.startSec = 0;
    this.endSec = buffer.duration;
    this.resize();
    this.computePeaks(buffer);
    this.draw();
    this.emitChange();
  }

  clear() {
    this.buffer = null;
    this.peaksMin = new Float32Array(0);
    this.peaksMax = new Float32Array(0);
    this.duration = 0;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  private computePeaks(buffer: AudioBuffer) {
    const width = this.width;
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
    this.peaksMin = min;
    this.peaksMax = max;
  }

  private timeToX(sec: number): number {
    return this.duration > 0 ? (sec / this.duration) * this.width : 0;
  }

  private xToTime(x: number): number {
    return this.duration > 0 ? (x / this.width) * this.duration : 0;
  }

  private emitChange() {
    this.onChange?.(this.range);
  }

  private eventX(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    return Math.max(0, Math.min(this.width, e.clientX - rect.left));
  }

  private handleNear(x: number): "start" | "end" | null {
    const startX = this.timeToX(this.startSec);
    const endX = this.timeToX(this.endSec);
    const dStart = Math.abs(x - startX);
    const dEnd = Math.abs(x - endX);
    if (dStart > HANDLE_HIT_PX && dEnd > HANDLE_HIT_PX) return null;
    return dStart <= dEnd ? "start" : "end";
  }

  private onPointerDown(e: PointerEvent) {
    const hit = this.handleNear(this.eventX(e));
    if (!hit) return;
    this.dragging = hit;
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.dragging) {
      this.canvas.style.cursor = this.handleNear(this.eventX(e)) ? "ew-resize" : "default";
      return;
    }
    const time = this.xToTime(this.eventX(e));
    if (this.dragging === "start") {
      this.startSec = Math.max(0, Math.min(time, this.endSec - MIN_GAP_SEC));
    } else {
      this.endSec = Math.min(this.duration, Math.max(time, this.startSec + MIN_GAP_SEC));
    }
    this.draw();
    this.emitChange();
  }

  private drawHandle(x: number, direction: 1 | -1) {
    const { ctx, height } = this;
    ctx.strokeStyle = HANDLE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillStyle = HANDLE_COLOR;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 10);
    ctx.lineTo(x + direction * 7, 5);
    ctx.closePath();
    ctx.fill();
  }

  draw() {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const startX = this.timeToX(this.startSec);
    const endX = this.timeToX(this.endSec);

    for (let x = 0; x < width; x++) {
      const inSelection = x >= startX && x <= endX;
      const yTop = mid - this.peaksMax[x] * mid;
      const yBottom = mid - this.peaksMin[x] * mid;
      ctx.strokeStyle = inSelection ? WAVE_COLOR : WAVE_COLOR_DIM;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, Math.min(yTop, mid - 0.5));
      ctx.lineTo(x + 0.5, Math.max(yBottom, mid + 0.5));
      ctx.stroke();
    }

    ctx.fillStyle = DISCARD_SHADE;
    if (startX > 0) ctx.fillRect(0, 0, startX, height);
    if (endX < width) ctx.fillRect(endX, 0, width - endX, height);

    ctx.save();
    this.drawHandle(startX, 1);
    this.drawHandle(endX, -1);
    ctx.restore();
  }
}

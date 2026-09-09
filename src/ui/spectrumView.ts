const MIN_FREQ = 20;
const PRE_COLOR = "rgba(44, 122, 44, 0.65)";
const POST_COLOR = "#57f057";
const POST_FILL = "rgba(87, 240, 87, 0.18)";
const CUTOFF_SHADE = "rgba(0, 0, 0, 0.65)";
const CUTOFF_LINE = "rgba(255, 180, 0, 0.75)";
const BAND_DIVIDER_LINE = "rgba(87, 240, 87, 0.12)";

/** Renders overlaid before/after-EQ frequency spectra on a log frequency axis. */
export class SpectrumView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sampleRate: number;
  private readonly binCount: number;
  private readonly bandFrequencies: readonly number[];

  // Per pixel column, the continuous (fractional) FFT bin range it covers.
  // Low frequencies: a column spans less than one bin -> interpolate.
  // High frequencies: a column spans many bins -> average them.
  private binLoForX = new Float64Array(0);
  private binHiForX = new Float64Array(0);
  // X position of each crossover between adjacent EQ bands (geometric mean of their frequencies).
  private bandBoundaryX: number[] = [];
  private width = 0;
  private height = 0;
  private maxFreq = 20000;
  private lastX = 1;

  constructor(canvas: HTMLCanvasElement, sampleRate: number, binCount: number, bandFrequencies: readonly number[]) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
    this.sampleRate = sampleRate;
    this.binCount = binCount;
    this.bandFrequencies = bandFrequencies;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nyquist = this.sampleRate / 2;
    this.maxFreq = Math.min(20000, nyquist);
    this.lastX = Math.max(1, this.width - 1);
    const freqAtX = (x: number) => MIN_FREQ * Math.pow(this.maxFreq / MIN_FREQ, x / this.lastX);

    this.binLoForX = new Float64Array(this.width);
    this.binHiForX = new Float64Array(this.width);
    for (let x = 0; x < this.width; x++) {
      const freqLo = freqAtX(x - 0.5);
      const freqHi = freqAtX(x + 0.5);
      const maxBin = this.binCount - 1;
      this.binLoForX[x] = Math.max(0, Math.min(maxBin, (freqLo / nyquist) * this.binCount));
      this.binHiForX[x] = Math.max(0, Math.min(maxBin, (freqHi / nyquist) * this.binCount));
    }

    this.bandBoundaryX = [];
    for (let i = 0; i < this.bandFrequencies.length - 1; i++) {
      const crossoverFreq = Math.sqrt(this.bandFrequencies[i] * this.bandFrequencies[i + 1]);
      this.bandBoundaryX.push(this.freqToX(crossoverFreq));
    }
  }

  private freqToX(freq: number): number {
    const clamped = Math.min(this.maxFreq, Math.max(MIN_FREQ, freq));
    return this.lastX * (Math.log(clamped / MIN_FREQ) / Math.log(this.maxFreq / MIN_FREQ));
  }

  draw(preData: Uint8Array, postData: Uint8Array, lowCutHz: number, highCutHz: number) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawCutoffShading(lowCutHz, highCutHz);
    this.drawBandDividers();
    this.drawTrace(preData, PRE_COLOR);
    this.drawTrace(postData, POST_COLOR, POST_FILL);
    this.drawCutoffLines(lowCutHz, highCutHz);
  }

  /** Marks the crossover point between each pair of adjacent EQ bands. */
  private drawBandDividers() {
    const { ctx, height } = this;
    if (this.bandBoundaryX.length === 0) return;
    ctx.save();
    ctx.strokeStyle = BAND_DIVIDER_LINE;
    ctx.lineWidth = 1;
    for (const x of this.bandBoundaryX) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCutoffShading(lowCutHz: number, highCutHz: number) {
    const { ctx, width, height } = this;
    ctx.fillStyle = CUTOFF_SHADE;
    const lowX = this.freqToX(lowCutHz);
    if (lowX > 0) ctx.fillRect(0, 0, lowX, height);
    const highX = this.freqToX(highCutHz);
    if (highX < width) ctx.fillRect(highX, 0, width - highX, height);
  }

  private drawCutoffLines(lowCutHz: number, highCutHz: number) {
    const { ctx, height } = this;
    ctx.save();
    ctx.strokeStyle = CUTOFF_LINE;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    for (const freq of [lowCutHz, highCutHz]) {
      const x = this.freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Samples one pixel column: linear-interpolates within a bin, or averages across bins. */
  private sampleColumn(data: Uint8Array, x: number): number {
    const lo = this.binLoForX[x];
    const hi = this.binHiForX[x];

    if (hi - lo < 1) {
      const i0 = Math.floor(lo);
      const i1 = Math.min(this.binCount - 1, i0 + 1);
      const frac = lo - i0;
      return data[i0] * (1 - frac) + data[i1] * frac;
    }

    const i0 = Math.round(lo);
    const i1 = Math.max(i0, Math.round(hi));
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += data[i];
    return sum / (i1 - i0 + 1);
  }

  private drawTrace(data: Uint8Array, strokeColor: string, fillColor?: string) {
    const { ctx, width, height } = this;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const v = this.sampleColumn(data, x) / 255;
      const y = height - v * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    if (fillColor) {
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
  }
}

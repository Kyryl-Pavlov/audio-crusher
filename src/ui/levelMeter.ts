const METER_MIN_DB = -60;
const METER_MAX_DB = 0;
// Jumps up instantly on a transient but falls back down gradually, so the meter
// reads as a bouncing needle rather than a flicker.
const METER_RELEASE_DB_PER_FRAME = 0.6;

export function dbToMeterPct(db: number): string {
  return `${Math.min(100, Math.max(0, ((db - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)) * 100))}%`;
}

/** Drives a `.level-meter-fill` bar from time-domain samples, call `update()` once per frame. */
export class PeakMeter {
  private displayedDb = METER_MIN_DB;
  private readonly fillEl: HTMLElement;
  private readonly valueEl: HTMLElement | null | undefined;

  constructor(fillEl: HTMLElement, valueEl?: HTMLElement | null) {
    this.fillEl = fillEl;
    this.valueEl = valueEl;
  }

  /** Returns the displayed dB value, in case the caller wants it for further styling. */
  update(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const instantDb = peak > 0 ? 20 * Math.log10(peak) : METER_MIN_DB;
    this.displayedDb = Math.max(instantDb, this.displayedDb - METER_RELEASE_DB_PER_FRAME, METER_MIN_DB);
    this.fillEl.style.width = dbToMeterPct(this.displayedDb);
    if (this.valueEl) this.valueEl.textContent = `${this.displayedDb.toFixed(1)}dB`;
    return this.displayedDb;
  }
}

export const LOW_CUT_MIN = 20;
export const LOW_CUT_MAX = 2000;
export const HIGH_CUT_MIN = 500;
export const HIGH_CUT_MAX = 20000;
export const DRIVE_TONE_MIN = 500;
export const DRIVE_TONE_MAX = 12000;

/** Maps a 0..1 slider position to Hz on a log scale. */
export const sliderToFreq = (t: number, min: number, max: number) => min * Math.pow(max / min, t);
/** Inverse of sliderToFreq: maps a Hz value back to its 0..1 log-scale slider position. */
export const freqToSlider = (hz: number, min: number, max: number) =>
  Math.min(1, Math.max(0, Math.log(hz / min) / Math.log(max / min)));

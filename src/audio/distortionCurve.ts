export type DriveType = "overdrive" | "distortion";

const CURVE_SAMPLES = 2048;
// Slope at the origin is (1 + k), so these bound how hot each stage can run.
const OVERDRIVE_MAX_K = 20;
const DISTORTION_MAX_K = 30;

/**
 * Builds a WaveShaperNode transfer curve for a drive stage. "Overdrive" is a
 * rational soft-knee saturator — smooth and peak-normalized to 1 at every
 * drive level, so it warms up without ever hard-clipping. "Distortion" feeds
 * the same (1+k)*x shape into a hard clip instead, so past a modest drive it
 * flattens into a square-wave-like, fuzzier tone.
 */
export function generateDriveCurve(type: DriveType, amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_SAMPLES);
  const k = amount * (type === "overdrive" ? OVERDRIVE_MAX_K : DISTORTION_MAX_K);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
    const driven = (1 + k) * x;
    curve[i] = type === "overdrive" ? driven / (1 + k * Math.abs(x)) : Math.max(-1, Math.min(1, driven));
  }
  return curve;
}

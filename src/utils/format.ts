export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`;
}

export const fmtSigned = (n: number, suffix: string) => `${n > 0 ? "+" : ""}${n}${suffix}`;
export const fmtHz = (hz: number) => `${hz.toFixed(2)} Hz`;
export const fmtSpeed = (rate: number) => `${rate.toFixed(2)}×`;
export const fmtCutoffFreq = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`);

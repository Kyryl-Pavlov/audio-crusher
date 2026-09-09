export type VinylIntensity = "light" | "medium" | "heavy";

interface VinylProfile {
  hissLevel: number;
  cracklesPerSecond: number;
  popsPerSecond: number;
}

const VINYL_PROFILES: Record<VinylIntensity, VinylProfile> = {
  light: { hissLevel: 0.015, cracklesPerSecond: 25, popsPerSecond: 0.6 },
  medium: { hissLevel: 0.03, cracklesPerSecond: 55, popsPerSecond: 1.4 },
  heavy: { hissLevel: 0.05, cracklesPerSecond: 100, popsPerSecond: 2.8 },
};

const LOOP_SECONDS = 6;
const CROSSFADE_SECONDS = 0.05;

/**
 * Synthesizes a seamlessly-loopable stereo "dusty vinyl" noise bed: filtered
 * surface hiss plus sparse crackle/pop transients, so no bundled sample is
 * needed. The tail is crossfaded into the head so looping produces no click.
 */
export function generateVinylNoiseBuffer(ctx: BaseAudioContext, intensity: VinylIntensity): AudioBuffer {
  const profile = VINYL_PROFILES[intensity];
  const crossfadeSamples = Math.floor(ctx.sampleRate * CROSSFADE_SECONDS);
  const length = Math.max(crossfadeSamples * 2, Math.floor(ctx.sampleRate * LOOP_SECONDS));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const raw = new Float32Array(length + crossfadeSamples);

    let hissState = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      hissState += (white - hissState) * 0.5;
      raw[i] = hissState * profile.hissLevel;
    }
    scatterTransients(raw, ctx.sampleRate, profile.cracklesPerSecond, 0.0006, 0.15);
    scatterTransients(raw, ctx.sampleRate, profile.popsPerSecond, 0.004, 0.6);

    const data = buffer.getChannelData(channel);
    data.set(raw.subarray(0, length));
    for (let i = 0; i < crossfadeSamples; i++) {
      const t = i / crossfadeSamples;
      data[i] = data[i] * t + raw[length + i] * (1 - t);
    }
  }

  return buffer;
}

/** Adds random short click/pop transients (alternating polarity, triangular envelope) in place. */
function scatterTransients(
  data: Float32Array,
  sampleRate: number,
  perSecond: number,
  maxHalfWidthSeconds: number,
  maxAmplitude: number,
) {
  const count = Math.round(perSecond * (data.length / sampleRate));
  for (let n = 0; n < count; n++) {
    const center = Math.floor(Math.random() * data.length);
    const halfWidth = Math.max(1, Math.floor(maxHalfWidthSeconds * sampleRate * (0.3 + Math.random() * 0.7)));
    const amplitude = maxAmplitude * (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? -1 : 1);
    for (let i = -halfWidth; i <= halfWidth; i++) {
      const idx = center + i;
      if (idx < 0 || idx >= data.length) continue;
      const envelope = 1 - Math.abs(i) / halfWidth;
      data[idx] += amplitude * envelope * envelope;
    }
  }
}

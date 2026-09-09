export type ReverbType = "room" | "hall" | "cathedral";

const REVERB_PRESETS: Record<ReverbType, { duration: number; decay: number }> = {
  room: { duration: 1.2, decay: 3.2 },
  hall: { duration: 2.6, decay: 2.0 },
  cathedral: { duration: 4.5, decay: 1.1 },
};

/**
 * Synthesizes a stereo impulse response (exponentially-decaying noise) so the
 * app needs no bundled IR audio assets or third-party licensing.
 */
export function generateImpulseResponse(ctx: BaseAudioContext, type: ReverbType): AudioBuffer {
  const { duration, decay } = REVERB_PRESETS[type];
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
}

export type SwellLength = "short" | "medium" | "long";

const SWELL_PRESETS: Record<SwellLength, { duration: number; rise: number }> = {
  short: { duration: 0.8, rise: 2.5 },
  medium: { duration: 1.8, rise: 2.0 },
  long: { duration: 3.2, rise: 1.6 },
};

/**
 * Synthesizes a *rising*-envelope stereo impulse response — the real-time-safe
 * approximation of a reverse-reverb swell. True reverse reverb requires reversing the
 * input first, which for a live signal means unbounded lookahead latency; convolving
 * with an IR whose envelope rises instead of decays gives the same "swelling in"
 * character without needing to see the future.
 */
export function generateReverseSwellImpulseResponse(ctx: BaseAudioContext, length: SwellLength): AudioBuffer {
  const { duration, rise } = SWELL_PRESETS[length];
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) {
      const envelope = Math.pow(i / len, rise);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
}

export type CabinetType = "phone" | "am-radio" | "small-speaker";

const CABINET_PRESETS: Record<CabinetType, { duration: number; resonanceHz: number; decay: number }> = {
  phone: { duration: 0.02, resonanceHz: 1500, decay: 4 },
  "am-radio": { duration: 0.03, resonanceHz: 900, decay: 3 },
  "small-speaker": { duration: 0.04, resonanceHz: 2200, decay: 2.5 },
};

/**
 * Synthesizes a short, resonance-colored impulse response standing in for a small
 * playback device (phone earpiece, AM radio, small speaker) — band-limited noise
 * shaped by one resonant tone, decaying far faster than a room/hall/cathedral IR
 * since real cabinets/speakers have a much shorter, more colored response.
 */
export function generateCabinetImpulseResponse(ctx: BaseAudioContext, type: CabinetType): AudioBuffer {
  const { duration, resonanceHz, decay } = CABINET_PRESETS[type];
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  const ringStep = (2 * Math.PI * resonanceHz) / ctx.sampleRate;

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let ringPhase = 0;
    for (let i = 0; i < len; i++) {
      const envelope = Math.pow(1 - i / len, decay);
      const noise = Math.random() * 2 - 1;
      ringPhase += ringStep;
      data[i] = (noise * 0.4 + Math.sin(ringPhase) * 0.6) * envelope;
    }
  }

  return buffer;
}

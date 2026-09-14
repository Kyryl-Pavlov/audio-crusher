// Live tab-capture has no buffer-backed source, so it has nothing like an
// AudioBufferSourceNode.playbackRate to lean on for tempo change — the file-playback
// path's Speed control gets its actual tempo shift for free from that native resample,
// with the downstream SoundTouch node only shifting pitch back to compensate (see
// EffectsGraph.setSpeed). A live MediaStreamAudioSourceNode has no such knob, so this
// worklet does real time-domain stretching instead: a WSOLA-style overlap-add (OLA)
// granular stretcher. Two alternating, 50%-overlapping grains read the live ring
// buffer at native (1:1) rate — which is what keeps pitch/timbre untouched inside a
// grain — while successive grains' *start position in the source* advances by
// `hopOut * speed` instead of the `hopOut` the *output* advances by. That mismatch
// alone is the whole tempo effect: speed < 1 pulls successive grains from closer
// together in the source (stretching it across more output time), speed > 1 pulls them
// from further apart (compressing it) — pitch is never touched.
//
// A rigid hop target (plain OLA) picks each new grain's source position purely
// arithmetically, with no regard for whether it's actually in phase with the grain
// it's crossfading against — on real program material the two rarely line up, and the
// overlap region combs/cancels into an audible "doubling", like a second, detuned copy
// playing under the first. Each time a grain restarts, this searches a small window
// (±SEARCH_SECONDS) of nearby source offsets for the one whose upcoming content best
// matches the *other* voice's currently-fading-out tail (least squared difference) and
// splices there instead — the classic WSOLA fix. It's applied on top of, not instead
// of, the hopIn-driven nominal position, so the tempo math above is untouched; it only
// nudges *where exactly* within roughly that neighborhood the splice lands.
//
// A live stream can't be paused, so slowing playback down means falling further behind
// the live edge for as long as the slowdown lasts — there's no way around that, only how
// gracefully it's handled. This buffers up to RING_SECONDS of history and, once the
// backlog (bounded by MAX_LAG_SECONDS) would be exhausted, skips the read position
// forward to a smaller lag (SKIP_TARGET_LAG_SECONDS) rather than let the delay from
// live grow without bound — a single audible skip, repeated every so often for as long
// as the slowdown continues, buying back room to keep actually stretching each time
// instead of just parking at the boundary (see findSplice()'s comment for why parking
// there would be indistinguishable from giving up on slowing down at all). Speeding up
// has the mirror problem — catching up can't outrun audio that hasn't arrived yet — so
// the read point is clamped to stay a small safety margin behind the write head
// instead; unlike the slow-down side, riding right at *that* boundary is exactly the
// desired "caught up to live" behavior, so it doesn't need a skip-back of its own. Each
// voice is checked independently at its own recycle (they're always offset from each
// other by ~hopIn, so a shared/approximate check would leave one of them free to
// silently drift out of bounds), so this can never read unwritten or stale,
// already-overwritten audio.
//
// RING_SECONDS sets how much real memory this costs: two Float32Arrays (stereo) of
// RING_SECONDS * sampleRate frames each, ~353KB per buffered second at 44.1kHz stereo.
// 1200s (20 minutes) is ~404MB at 44.1kHz / ~439MB at 48kHz — comfortably under a
// 500MB budget even on a higher-rate system — which pushes the skip interval for any
// realistic sustained slow-down speed out to tens of minutes instead of seconds.
const RING_SECONDS = 1200;
const MAX_LAG_SECONDS = 1200;
// Once the backlog budget (MAX_LAG_SECONDS) is used up, riding exactly at that boundary
// forever is mathematically indistinguishable from real-time playback — a fixed lag
// means the read position has to advance in lockstep with the write head, i.e. speed 1,
// permanently, no matter what's requested. So instead of clamping to the boundary
// itself, exceeding it jumps back to this closer, smaller lag instead — a single
// audible skip that trades a chunk of the backlog for room to keep stretching, rather
// than parking at 1x for the rest of the session.
const SKIP_TARGET_LAG_SECONDS = 30;
const MIN_LAG_SECONDS = 0.01;
const GRAIN_SECONDS = 0.06;
const SEARCH_SECONDS = 0.008;
const SEARCH_STEP_SAMPLES = 1;
const CORRELATION_STRIDE = 4;
// Below this average-squared-amplitude, a reference segment is treated as silence: any
// two candidate splice points score an almost-identical (near-zero) cost against it, so
// the search has nothing real to align to and would otherwise just chase
// floating-point noise — picking an essentially arbitrary offset every recycle and
// accumulating into real timing drift over many recycles instead of leaving the grain
// at its untouched nominal position.
const SILENCE_ENERGY_THRESHOLD = 1e-6;
// How much to smooth the achievedSpeed estimate (below) between recycle events, and how
// often (in recycle events, not samples) to report it to the main thread — see the
// achievedSpeed comment in the constructor for what it's for.
const ACHIEVED_SPEED_EMA_ALPHA = 0.2;
const REPORT_EVERY_N_RECYCLES = 8;
const MIN_SPEED = 0.05;
const MAX_SPEED = 3;

class LiveSpeedProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "speed", defaultValue: 1, minValue: MIN_SPEED, maxValue: MAX_SPEED }];
  }

  // ringSeconds/maxLagSeconds/skipTargetLagSeconds are overridable via processorOptions
  // (the same mechanism @soundtouchjs/audio-worklet's SoundTouchNode uses) purely so
  // tests can exercise the skip-and-recover path (see findSplice()) against a small,
  // fast-to-exhaust budget without waiting out the real, much larger production one.
  constructor(options) {
    super();
    const opts = options?.processorOptions ?? {};
    const ringSeconds = opts.ringSeconds ?? RING_SECONDS;
    const maxLagSeconds = opts.maxLagSeconds ?? MAX_LAG_SECONDS;
    const skipTargetLagSeconds = opts.skipTargetLagSeconds ?? SKIP_TARGET_LAG_SECONDS;

    this.ringLength = Math.ceil(sampleRate * ringSeconds);
    this.ring = [];
    this.writeIndex = 0;
    this.written = 0;

    // Kept even so the two voices below split it into equal half-grain hops.
    this.grainLength = Math.max(4, Math.round((sampleRate * GRAIN_SECONDS) / 2) * 2);
    this.hopOut = this.grainLength / 2;
    this.maxLagSamples = Math.min(this.ringLength - this.grainLength, Math.round(sampleRate * maxLagSeconds));
    this.skipTargetLagSamples = Math.min(this.maxLagSamples, Math.round(sampleRate * skipTargetLagSeconds));
    this.minLagSamples = Math.round(sampleRate * MIN_LAG_SECONDS);
    this.searchSamples = Math.max(1, Math.round(sampleRate * SEARCH_SECONDS));
    // Reused across recycle events to avoid allocating on the audio thread.
    this.referenceBuf = new Float32Array(this.hopOut);

    // How many source samples are actually being consumed per output sample, smoothed
    // across recent recycle events — equal to the requested `speed` when there's enough
    // buffered backlog to honor it, but pulled toward 1 by the minBase/maxBase clamp in
    // findSplice() when there isn't (see the top-of-file comment). EffectsGraph uses
    // this (reported below, not the raw `speed` param) to scale "link pitch to speed"'s
    // shift for the live path, so the pitch shift backs off in step with tempo actually
    // being unable to keep up, instead of continuing to shift by the full requested
    // amount even once there's no real tempo change left backing it.
    this.achievedSpeed = 1;
    this.recyclesSinceReport = 0;

    this.started = false;
    // voices[0] leads (starts a fresh grain at age 0); voices[1] trails by half a
    // grain so their triangular windows sum to a constant 1 once both are active — the
    // standard 50%-overlap OLA arrangement. voices[1] starts at a *negative* age
    // (silently not yet contributing — see the age < 0 check in process()) rather than
    // already at its own peak, so it fades in smoothly over the first hopOut samples
    // instead of jumping straight to a full-volume read from a different point in the
    // buffer than whatever the passthrough phase was just outputting, which clicked.
    // cycleStartWritten records `written` at the instant each voice's current grain
    // began, so achievedSpeed can be measured as (source advance) / (output elapsed)
    // exactly, without assuming every cycle is a full grainLength (the very first one,
    // starting from a negative age, isn't). idealBase tracks the same trajectory as
    // base *without* the WSOLA search's per-cycle nudge (see findSplice()) — used as
    // the reference point for computing each *next* nominal position instead of the
    // searched `base`, so the search's alignment choice for one grain doesn't also
    // perturb where every later grain in the sequence lands. Without this separation,
    // the search's ±SEARCH_SECONDS jitter (a substantial fraction of a slow-speed
    // grain's whole advance) compounds cycle to cycle into real, audible tempo
    // instability — not just a one-off nudge, but the *trajectory itself* wobbling.
    this.voices = [
      { base: 0, idealBase: 0, age: 0, cycleStartWritten: 0 },
      { base: 0, idealBase: 0, age: -this.hopOut, cycleStartWritten: 0 },
    ];

    // EffectsGraph sends this whenever it hands this node a fresh engagement (moving
    // speed below 1x again after being at/above 1x, including after a detected track
    // change) rather than recreating the node — reinitializing written/started here is
    // what makes every such engagement start clean, exactly like the very first one,
    // instead of resuming from wherever a previous, possibly long-stale, engagement
    // left off. Ring buffer contents are left untouched: `started = false` already
    // guarantees nothing reads from them until fresh samples land post-reset, the same
    // guarantee the normal startup bootstrap above relies on.
    this.port.onmessage = (e) => {
      if (e.data?.type !== "reset") return;
      this.written = 0;
      this.writeIndex = 0;
      this.started = false;
      this.achievedSpeed = 1;
      this.recyclesSinceReport = 0;
      for (const voice of this.voices) {
        voice.age = 0;
        voice.base = 0;
        voice.idealBase = 0;
        voice.cycleStartWritten = 0;
      }
    };
  }

  /** Linear-interpolated read from the ring buffer at a fractional, unwrapped source
   *  position, averaged across all channels (a mono downmix) — used only for
   *  alignment search, so a splice choice can't be thrown off by content that happens
   *  to be quiet or absent on one channel (e.g. a hard-panned source). */
  readMono(pos) {
    let sum = 0;
    for (let ch = 0; ch < this.ring.length; ch++) sum += this.readSample(ch, pos);
    return sum / this.ring.length;
  }

  /** Linear-interpolated read from one channel's ring buffer at a fractional, unwrapped source position. */
  readSample(ch, pos) {
    const buf = this.ring[ch];
    const len = this.ringLength;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = buf[((i0 % len) + len) % len];
    const b = buf[(((i0 + 1) % len) + len) % len];
    return a + (b - a) * frac;
  }

  /** Triangular (Bartlett) window peaking at the grain's midpoint. */
  windowAt(age) {
    const half = this.hopOut;
    return age < half ? age / half : 2 - age / half;
  }

  /** Squared-difference cost between the reference and the hopOut-length segment
   *  starting at `base`, sampled every CORRELATION_STRIDE-th frame. Lower is a better splice. */
  spliceCost(base, ref, len) {
    let cost = 0;
    for (let j = 0; j < len; j += CORRELATION_STRIDE) {
      const diff = this.readMono(base + j) - ref[j];
      cost += diff * diff;
    }
    return cost;
  }

  /** Finds the source position near `nominalBase` whose upcoming hopOut-length content
   *  best matches (least squared difference against) `other`'s currently-fading tail —
   *  the segment it'll be crossfaded with. `nominalBase` is clamped into range *before*
   *  searching (not just searched near) — the live-edge/ring-history safety margins
   *  this enforces only need checking here, once, at the instant a grain starts: within
   *  a grain, the write head and the read position both advance exactly 1:1 with real
   *  time, so how far apart they are never changes for that grain's whole lifetime once
   *  it's chosen. (An earlier version re-checked every sample instead and nudged
   *  voice.base mid-grain when it drifted — but the "drift" it was reacting to was this
   *  same fact miscomputed, since it compared `written` against the grain's *start*
   *  position without accounting for how far into the grain playback already was; the
   *  resulting mid-grain jumps broke the native-rate, pitch-preserving readthrough
   *  within a grain and were audible as clicks even well away from the actual boundary
   *  case.)
   *
   *  The two directions clamp differently: too close to the write head (`nominalBase >
   *  maxBase`, catching up too fast) clamps down to `maxBase` — riding right at that
   *  boundary is exactly the desired "caught up to live" behavior once there's no more
   *  backlog to consume. Too far behind (`nominalBase < minBase`, exceeding the backlog
   *  budget) does *not* clamp up to `minBase` the same way: parking exactly on a fixed
   *  lag boundary forces the read position to advance in lockstep with the write head
   *  from then on — i.e. exactly real-time speed, permanently, with no way back to
   *  actually being slower, since every later nominalBase keeps falling below whatever
   *  `minBase` has grown to by then. Instead it jumps forward to `skipTargetBase` (a
   *  smaller lag, further from the boundary) — an audible skip, but one that buys back
   *  room to keep providing real slowdown until the budget is used up again, rather
   *  than giving up on slowing down at all for the rest of the session.
   *
   *  Falls back to the clamped/skipped position both when the reference is too quiet to
   *  have a meaningful best match (see SILENCE_ENERGY_THRESHOLD) and, by starting the
   *  search from d=0's own cost as the baseline instead of from an empty/Infinity one,
   *  whenever no candidate is a clear improvement on it.
   *
   *  Returns both `idealBase` (the clamped position *before* the search's nudge — the
   *  trajectory a later cycle's nominalBase should build on) and `base` (idealBase plus
   *  whatever offset the search chose — the position this grain actually reads from).
   *  Keeping them separate is what stops the search's alignment choice for one grain
   *  from also perturbing where every later grain in the sequence lands (see the
   *  constructor's voices comment). */
  findSplice(nominalBase, other, minBase, maxBase, skipTargetBase) {
    const idealBase = nominalBase < minBase ? skipTargetBase : Math.min(maxBase, nominalBase);
    const len = this.hopOut;
    const ref = this.referenceBuf;
    let refEnergy = 0;
    for (let j = 0; j < len; j++) {
      const s = this.readMono(other.base + other.age + j);
      ref[j] = s;
      refEnergy += s * s;
    }
    if (refEnergy / len < SILENCE_ENERGY_THRESHOLD) return { idealBase, base: idealBase };

    const loD = Math.max(-this.searchSamples, minBase - idealBase);
    const hiD = Math.min(this.searchSamples, maxBase - idealBase);
    if (loD > hiD) return { idealBase, base: idealBase };

    let bestOffset = Math.min(hiD, Math.max(loD, 0));
    let bestCost = this.spliceCost(idealBase + bestOffset, ref, len);
    for (let d = loD; d <= hiD; d += SEARCH_STEP_SAMPLES) {
      if (d === bestOffset) continue;
      const cost = this.spliceCost(idealBase + d, ref, len);
      if (cost < bestCost) {
        bestCost = cost;
        bestOffset = d;
      }
    }
    return { idealBase, base: idealBase + bestOffset };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output[0]) return true;

    const channels = output.length;
    while (this.ring.length < channels) this.ring.push(new Float32Array(this.ringLength));

    const speedParam = parameters.speed;
    const frames = output[0].length;

    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const inCh = input[ch] ?? input[0];
        this.ring[ch][this.writeIndex] = inCh ? inCh[i] : 0;
      }
      this.writeIndex = (this.writeIndex + 1) % this.ringLength;
      this.written++;
    }

    // Not enough history yet to read a whole grain from — stay silent (rather than
    // passing the live signal through) until there is: both voices below start faded
    // all the way out (age 0 and age < 0) and ramp up from there, so silence flowing
    // into that fade-in is seamless, where passthrough audio suddenly cutting to
    // voices still at zero weight would have clicked.
    if (!this.started) {
      if (this.written < this.grainLength) {
        for (let i = 0; i < frames; i++) {
          for (let ch = 0; ch < channels; ch++) output[ch][i] = 0;
        }
        return true;
      }
      this.started = true;
      const initialSpeed = speedParam[0];
      const startBase = this.written - this.grainLength;
      this.voices[0].base = startBase;
      this.voices[0].idealBase = startBase;
      this.voices[0].age = 0;
      this.voices[0].cycleStartWritten = this.written;
      // voices[1]'s first real grain (once it starts contributing — see the age < 0
      // check below) continues the sequence one hop past voices[0]'s — clamped the
      // same way findSplice() clamps every later recycle, since a high initial speed
      // can otherwise place it right at (or past) the live edge before it even starts.
      const bootstrapMinBase = this.written - this.maxLagSamples;
      const bootstrapMaxBase = this.written - this.minLagSamples;
      const voice1Base = Math.min(bootstrapMaxBase, Math.max(bootstrapMinBase, startBase + this.hopOut * initialSpeed));
      this.voices[1].base = voice1Base;
      this.voices[1].idealBase = voice1Base;
      this.voices[1].age = -this.hopOut;
      this.voices[1].cycleStartWritten = this.written;
    }

    for (let i = 0; i < frames; i++) {
      const speed = speedParam.length > 1 ? speedParam[i] : speedParam[0];
      const hopIn = this.hopOut * speed;

      for (let ch = 0; ch < channels; ch++) {
        let sample = 0;
        for (const voice of this.voices) {
          if (voice.age < 0) continue; // not yet faded in (see the startup comment above)
          const w = this.windowAt(voice.age);
          if (w > 0) sample += this.readSample(ch, voice.base + voice.age) * w;
        }
        output[ch][i] = sample;
      }

      // Live-edge/ring-history safety bounds for whichever voice(s) recycle this
      // sample — see findSplice()'s comment for why this only needs checking here,
      // once per grain at the instant it starts, rather than continuously.
      const minBase = this.written - this.maxLagSamples;
      const maxBase = this.written - this.minLagSamples;
      const skipTargetBase = this.written - this.skipTargetLagSamples;
      for (const voice of this.voices) {
        voice.age++;
        if (voice.age >= this.grainLength) {
          // This grain finished — the next one this voice plays continues the
          // source-side sequence two hops on (the other voice covers the hop in
          // between, and is exactly at its own peak right now), which is what
          // actually stretches/compresses time. findSplice() nudges that nominal
          // position to wherever nearby lines up best in phase with the other
          // voice's tail, instead of using it rigidly.
          const other = voice === this.voices[0] ? this.voices[1] : this.voices[0];
          const oldIdealBase = voice.idealBase;
          const nominalBase = voice.idealBase + 2 * hopIn;
          const isSkip = nominalBase < minBase;
          const spliced = this.findSplice(nominalBase, other, minBase, maxBase, skipTargetBase);
          voice.idealBase = spliced.idealBase;
          voice.base = spliced.base;

          const cycleOutputLength = this.written - voice.cycleStartWritten;
          voice.cycleStartWritten = this.written;
          // A skip is a deliberate, discontinuous jump to a smaller lag (see the
          // top-of-file comment) -- not a genuine reading of how much slower/faster
          // than real time audio is actually playing. Folding it into achievedSpeed
          // like an ordinary cycle would corrupt it with one wildly unrepresentative
          // spike: the skip distance (up to MAX_LAG_SECONDS - SKIP_TARGET_LAG_SECONDS
          // worth of samples) divided by a single grain's worth of output time can be
          // orders of magnitude larger than any real speed, so it's excluded here.
          // Measured against idealBase (not the search-adjusted base) so the WSOLA
          // search's own per-cycle jitter doesn't show up here either — see the
          // constructor's voices comment for why that jitter is excluded on purpose.
          if (!isSkip && cycleOutputLength > 0) {
            const observedSpeed = (voice.idealBase - oldIdealBase) / cycleOutputLength;
            this.achievedSpeed += (observedSpeed - this.achievedSpeed) * ACHIEVED_SPEED_EMA_ALPHA;
            // Defense in depth against any other edge case producing a wild reading:
            // achievedSpeed feeds a pitch-shift AudioParam on the main thread, so it
            // should never leave the range actual requests to this processor use.
            this.achievedSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, this.achievedSpeed));
          }
          this.recyclesSinceReport++;
          if (this.recyclesSinceReport >= REPORT_EVERY_N_RECYCLES) {
            this.recyclesSinceReport = 0;
            this.port.postMessage({ type: "achievedSpeed", value: this.achievedSpeed });
          }

          voice.age = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("live-speed-processor", LiveSpeedProcessor);

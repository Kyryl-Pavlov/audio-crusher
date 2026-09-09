# Audio Crusher

A browser-based audio effects player — load a track (or capture one straight out of a
browser tab), then shape it in real time with a full FX chain, EQ, and a retro,
drag-and-drop plugin rack UI. Everything runs client-side on the Web Audio API;
nothing is ever uploaded anywhere.

**Live app: https://kyryl-pavlov.github.io/audio-crusher/**

## Features

- **Load a track** — drag a file onto the loader, or pick one from disk. Any format
  the browser's `decodeAudioData` supports.
- **Capture tab audio** — grab whatever's playing in another browser tab (e.g. a
  YouTube Music tab) via the browser's own share-tab picker, trim the recording on a
  waveform, then load the trimmed selection straight into the player.
- **Transport** — play/pause, reverse playback, seamless loop (crossfaded so the loop
  point never clicks), a seek bar, volume with a live level meter, and a jog wheel you
  can drag or scrub with the arrow keys (Shift = faster, Ctrl = finer).
- **Slicer** — click the waveform to drop a cue mark, drag to move it, right-click to
  delete it, and bind any mark to a keyboard key to jump there instantly during
  playback.
- **Speed / pitch** — 0.5×–1.5× playback speed, either pitch-linked (the classic
  tape-slowdown sound) or independent time-stretch via SoundTouch.
- **8-band EQ** — with a live before/after spectrum analyzer, plus steep (48 dB/oct)
  low-cut and high-cut filters.
- **FX Chain rack** — drag plugins from the library into a reorderable chain, stacking
  as many instances of each as you like. 28 modules across five families:
  - **Pitch/Time** — Pitch Shift, Harmonizer, Stereo Widener
  - **Modulation** — Auto-Pan (8D), Wow & Flutter, Chorus, Flanger, Phaser, Tremolo
  - **Dynamics** — Compressor, Noise Gate, Sidechain Ducking, Auto-Wah
  - **Texture** — Drive, Bitcrusher, Ring Modulator, Multiband Distortion, Telephone
    Filter, Cabinet Sim, Formant Filter, Vinyl Crackle
  - **Space/Time** — Delay, Reverb, Slapback Delay, Reverse Swell, Reverse Delay,
    Freeze, Granular Stutter
- **Presets** — one-click starting points: Slowed + Reverb, Nightcore, 8D Audio,
  Lo-Fi, Bass Boost, Vaporwave, Telephone, Underwater.

## Tech stack

- [Vite](https://vite.dev/) + TypeScript, no UI framework — plain DOM manipulation
- Web Audio API, with custom [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
  processors for bitcrusher, noise gate, stutter, and reverse-delay
- [`@soundtouchjs`](https://github.com/cutterbl/SoundTouchJS) for independent
  time-stretch / pitch-shift
- [Playwright](https://playwright.dev/) + Node's built-in test runner for tests

## Getting started

Requires [Node.js](https://nodejs.org/) 22.6+ (built-in test runner needs its
TypeScript support; Node 24 is what this project develops against).

```bash
npm install
npm run dev       # starts the dev server at http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check (tsc) then produce a production build in dist/
npm run preview    # serve the production build locally
npm run test:unit  # unit tests (node --test)
npm run test:e2e   # end-to-end tests (Playwright + Chromium)
npm test           # both test suites
```

The e2e suite drives a real Chromium instance via Playwright. If it's not installed
yet, run `npx playwright install chromium` once before `npm run test:e2e`.

## Browser support

Built on the Web Audio API and AudioWorklet, available in all current major
browsers. **Tab-audio capture** specifically needs a Chromium-based browser (Chrome,
Edge, Brave, …) — `getDisplayMedia`'s "share tab audio" option isn't available in
Firefox or Safari.

## Deployment

Pushing to `main` builds the app and publishes it to GitHub Pages automatically via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). See
[AGENTS.md](AGENTS.md) for how the Pages base path is configured.

## For AI coding agents

See [AGENTS.md](AGENTS.md) for architecture notes, conventions, and the checklist for
adding a new FX module. [CLAUDE.md](CLAUDE.md) points AI assistants at the same file.

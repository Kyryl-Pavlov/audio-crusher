# AGENTS.md

Guidance for AI coding agents working in this repo. See [README.md](README.md) for
what the app does from a user's perspective.

## What this is

Audio Crusher is a 100% client-side audio effects player: Vite + TypeScript, no UI
framework (plain DOM manipulation), no backend. There is no server-side code and
nothing is ever uploaded — everything happens in the browser via the Web Audio API.

## Commands

```bash
npm install
npm run dev         # dev server on :5173 (predev kills anything already bound to it)
npm run build        # tsc --noEmit-equivalent type-check, then vite build -> dist/
npm run preview      # serve the production build locally
npm run test:unit    # node --test over tests/unit/*.test.ts
npm run test:e2e     # Playwright + Chromium, spins up its own dev server on :5183
npm test             # both suites
```

Node 22.6+ is required — unit tests import `.ts` files directly and rely on Node's
built-in TypeScript type-stripping (no ts-node/tsx). `tsconfig.json` sets
`erasableSyntaxOnly: true` specifically so the source stays compatible with that
stripping (no enums, no parameter-property shorthand, no namespaces with runtime
behavior).

`test:e2e` needs a Chromium build available to Playwright; if missing, run
`npx playwright install chromium` first.

## Architecture

- **`src/audio/EffectsGraph.ts`** — the whole Web Audio graph and transport, and the
  single point every UI panel talks to. Fixed signal path: loop-seam gain → low-cut
  filters → high-cut filters → 8-band EQ → `SoundTouchNode` (speed/pitch) → **dynamic
  FX chain** → master gain → destination. Owns play/pause/seek/reverse/loop, all
  fixed-node parameters (EQ, cutoffs, volume), and forwards per-module parameter calls
  (`setDriveAmount`, `setDelayTime`, etc.) down into the dynamic chain via
  `getModule()`.
- **`src/audio/ModuleChain.ts`** — owns the *dynamic* part of the chain: live module
  instances, their order, and the factory (`createModule`) that constructs them by
  `ModuleType`. `splice()` rewires `prev.output.connect(next.input)` across the
  current order; `EffectsGraph.rewireChain()` calls it wrapped in a brief duck (fade
  to silence and back) so reordering/adding/removing a module never clicks.
- **`src/audio/modules/*Module.ts`** — one class per FX module, each implementing
  `EffectModule` (`src/audio/modules/types.ts`): a stable `input`/`output` node pair
  plus `dispose()`. Internals are free to be anything (a `BiquadFilterNode` chain, an
  `AudioWorkletNode`, an LFO-driven param, …) as long as that contract holds.
- **`src/audio/worklets/*.js`** — plain JavaScript `AudioWorkletProcessor`s (bitcrusher,
  noise gate, stutter, reverse delay), imported via Vite's `?url` suffix and registered
  with `ctx.audioWorklet.addModule()` in `EffectsGraph.create()`. These are **not**
  type-checked or bundled through `tsc` — they run in the separate audio-worklet
  global scope, so keep them dependency-free vanilla JS.
- **`src/ui/`** — one controller per card (`transport.ts`, `eq.ts`, `slicerPanel.ts`,
  `presets.ts`, `fileLoading.ts`, `tabCapturePanel.ts`, …), each a
  factory function taking the `EffectsGraph` (and occasionally another controller) and
  returning a small interface. `main.ts` wires them all up and drives one
  `requestAnimationFrame` loop that calls each controller's `tick()`.
- **`src/ui/fxChain/`** — the drag-and-drop rack. `rack.ts` handles the DOM
  drag/drop/reorder mechanics; `cardBuilders.ts` dispatches a module type to the
  builder that renders its control card, split by family across
  `cards/{pitchTimeCards,modulationCards,dynamicsCards,textureCards,spaceTimeCards}.ts`;
  `cardShell.ts` provides the shared card chrome (header, enable toggle, remove
  button, tooltip wiring).
- **`src/ui/moduleMeta.ts`** — the display metadata (label, icon, accent color,
  description, how-to text) for every `ModuleType`, used by both the plugin library
  sidebar and the chain cards.

## Adding a new FX module

There's no shortcut for this — a new module touches all of the following:

1. `src/audio/modules/<Name>Module.ts` — implement `EffectModule`.
2. `src/audio/modules/types.ts` — add the type string to the `ModuleType` union and a
   variant to the `ModuleConfig` union.
3. `src/audio/ModuleChain.ts` — add a `case` to `createModule()`.
4. `src/audio/EffectsGraph.ts` — add `set*` passthrough methods for its parameters
   (follow the existing `getModule<XModule>(id, "type")?.setFoo(...)` pattern).
5. `src/ui/moduleMeta.ts` — add an entry to `MODULE_META` and to the `MODULE_TYPES`
   array (this is what makes it appear in the plugin library sidebar).
6. `src/ui/fxChain/cards/<family>Cards.ts` — add a card builder function; wire it into
   `src/ui/fxChain/cardBuilders.ts`'s `buildChainCard()` switch.
7. `src/audio/neutralConfig.ts` — add its default/neutral `ModuleConfig`, used when a
   card is added with no preset-supplied config.
8. If it needs a custom DSP loop the built-in `AudioNode` graph can't express, add a
   worklet processor under `src/audio/worklets/` (see existing ones) and register it
   in `EffectsGraph.create()`.

The e2e test `tests/e2e/fxChainRack.test.ts` adds every `ModuleType` and asserts no
console/page errors — it will catch a missed step in this list (e.g. a type present
in `ModuleType` but not handled in one of the switches).

## Conventions

- Strict TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`); keep new code clean under those.
- Comments explain **why**, not what — see the block comments in `EffectsGraph.ts`
  around the duck/crossfade constants for the house style. Don't add comments that
  restate the code.
- UI controllers are factory functions (`createXController(graph, ...)`) returning a
  small object, not classes — match that shape for new panels.
- Audio-graph mutations that change topology (adding/removing/reordering chain
  modules) go through `rewireChain()`'s duck envelope; anything that just changes a
  param value uses `ramp()` (`src/audio/ramp.ts`) for a short linear ramp rather than
  snapping the raw `AudioParam`, to avoid zipper noise — except where a comment
  explains why a direct `setValueAtTime` is correct instead (e.g. the cutoff filters,
  which ramp very frequently during a slider drag).

## Deployment

`.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages on every
push to `main`. It's a project page (`https://kyryl-pavlov.github.io/audio-crusher/`),
so `vite.config.ts` sets `base: "/audio-crusher/"` for the `build` command only (dev
stays at `/`). If the repo is ever renamed, update the `base` value there to match.

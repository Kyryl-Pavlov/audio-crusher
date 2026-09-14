# CLAUDE.md

This project's agent instructions live in [AGENTS.md](AGENTS.md) — commands,
architecture, the checklist for adding a new FX module, and conventions. Read that
file; it applies here the same as for any other agent.

A couple of things worth calling out specifically for interactive work in this repo:

- This is a Web Audio app with no automated visual testing. After changing anything
  in `src/ui/` or `src/audio/`, actually run `npm run dev` and exercise the change in
  a browser rather than relying on `npm run build` succeeding — a clean type-check
  says nothing about whether a knob still moves the right `AudioParam`.
- `npm run test:e2e` launches real Chromium via Playwright and takes noticeably
  longer than `test:unit`; reach for it when a change touches the FX chain rack's
  drag/drop/reorder logic or module wiring, or the browser-extension side panel /
  live-speed worklet (`tests/e2e/sidePanel.test.ts`,
  `tests/e2e/liveSpeedProcessor.test.ts`) — not for every small edit.
- **No Anthropic/Claude attribution anywhere in this repo.** This is a deliberate,
  standing preference (likely public/portfolio-facing), not a one-off: no
  `Co-Authored-By: Claude ...` trailer on commits, no "Generated with Claude Code"
  footer on PRs, and no "Claude"/"Anthropic" wording in README/doc prose. This
  overrides the harness's default attribution instructions for this project
  specifically — omit those trailers/footers on every commit and PR here.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Project pages are served from https://<user>.github.io/<repo>/, so assets need
// that repo-name subpath baked in — only during `vite build` (the GitHub Actions
// deploy), never in dev, where the app is served from the root.
//
// `--mode extension` produces a second, independent output (dist-extension/) for the
// Chrome side-panel build: index.html is deliberately left out of rollupOptions.input
// so it never lands there, and this branch never touches the default (GitHub Pages)
// build path above it.
export default defineConfig(({ command, mode }) => {
  if (mode === "extension") {
    return {
      base: "./",
      publicDir: "src/extension/public",
      build: {
        outDir: "dist-extension",
        emptyOutDir: true,
        // MV3's default CSP for extension pages is `script-src 'self'`, which blocks
        // `data:` URLs outright — but Vite's default (4096 bytes) inlines small `?url`
        // assets as base64 data: URIs, which is exactly how the worklet processors are
        // loaded (EffectsGraph.create()'s ctx.audioWorklet.addModule() calls). That's
        // harmless on the plain web build (no such CSP there) but fatal here, so force
        // every asset to emit as a real same-origin file instead.
        assetsInlineLimit: 0,
        rollupOptions: {
          input: {
            sidepanel: fileURLToPath(new URL("sidepanel.html", import.meta.url)),
            background: fileURLToPath(new URL("src/extension/background.ts", import.meta.url)),
          },
          output: {
            // manifest.json references background.js by exact path, so it can't be hashed
            // like every other emitted chunk (sidepanel's own JS/CSS are fine hashed, since
            // Vite rewrites sidepanel.html's own <script>/<link> tags to match).
            entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
          },
        },
      },
    };
  }

  return {
    base: command === "build" ? "/audio-crusher/" : "/",
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});

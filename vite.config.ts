import { defineConfig } from "vite";

// Project pages are served from https://<user>.github.io/<repo>/, so assets need
// that repo-name subpath baked in — only during `vite build` (the GitHub Actions
// deploy), never in dev, where the app is served from the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/audio-crusher/" : "/",
  server: {
    port: 5173,
    strictPort: true,
  },
}));

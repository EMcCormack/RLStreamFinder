import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Twurple is compiled with TypeScript's importHelpers option. Use tslib's
    // ESM entry so Rolldown can bundle it safely into the Electron main file.
    alias: {
      tslib: "tslib/tslib.es6.mjs",
    },
  },
  build: {
    target: "node24",
  },
});

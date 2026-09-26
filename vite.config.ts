import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(dirname, "src/renderer"),
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: "./",
  build: {
    outDir: path.resolve(dirname, ".vite/renderer/main_window"),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});

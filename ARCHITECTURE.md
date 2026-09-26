**Architecture Overview**

This repository follows the common Electron split between privileged main process code, a preload bridge, and a renderer UI.

- `src/main/` — Electron main process code: app lifecycle, window creation, IPC handlers, and native integrations.
- `src/preload/` — Preload script that exposes a small, safe API surface to the renderer via `contextBridge`.
- `src/renderer/` — React application (Vite) and any purely UI code.
- `src/main/services/` — Service implementations used by `src/main` (Rocket League socket client, Twitch client, config helpers).
- `src/shared/` — Pure helpers, types, and IPC contracts shared between main and renderer (matching logic, constants).

Guidelines
- Keep UI code in `src/renderer` and avoid direct Electron imports there.
- Expose only small, well-typed functions on the `window` object via the preload script.
- Main process owns all OS and network integrations; services under `src/main/services` are not renderer-accessible directly.
- Shared pure helpers and DTOs belong in `src/shared` so both main and renderer can import them without coupling to Electron.

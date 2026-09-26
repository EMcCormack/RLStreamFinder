# Repository Guidelines

## Project Structure & Module Organization

This is an Electron app with a React renderer. `src/main/` owns app lifecycle, IPC handlers, and OS or network access; put integrations in `src/main/services/`. `src/preload/` exposes the typed bridge used by the UI. Keep React components and styles in `src/renderer/`, and pure helpers, shared types, and IPC contracts in `src/shared/`. Unit tests live in `test/*.test.ts`; the Electron smoke test lives in `test/e2e/`. Screenshots and release instructions are under `docs/`. See `ARCHITECTURE.md` before changing process boundaries.

## Build, Test, and Development Commands

Use Node.js 24 and pnpm 11.3.0. Run `pnpm install --frozen-lockfile` to install the locked dependencies, then `pnpm start` to launch the development app. `pnpm typecheck` checks TypeScript, and `pnpm test` runs Vitest once; use `pnpm test:watch` while editing. `pnpm package` creates a local unpacked app in `out/`. `pnpm test:smoke` packages the app and runs the Playwright Electron smoke test. Platform installers use commands such as `pnpm make:linux:deb` and `pnpm make:windows`; see `docs/RELEASING.md` for prerequisites.

## Coding Style & Naming Conventions

Follow the existing TypeScript and TSX style: two-space indentation, double quotes, semicolons, and descriptive camelCase functions and variables. Use PascalCase for React components and their `.tsx` files; use kebab-case for service and helper filenames, such as `match-history.ts`. Keep renderer code free of direct Electron imports; add narrow, typed preload methods and shared IPC contracts when crossing processes. There is no configured formatter or linter, so match nearby code and run `pnpm typecheck`.

## Testing Guidelines

Add Vitest tests in `test/` with the `*.test.ts` suffix for pure logic and service behavior. Use `test/e2e/*.spec.ts` for packaged Electron flows. Name tests for observable behavior and cover changed edge cases, especially roster parsing, match history, and Twitch matching. Run `pnpm typecheck` and `pnpm test` before a PR; run the smoke test when changing startup, preload, packaging, or UI integration. No coverage threshold is configured.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, sometimes prefixed with `feat:`, `fix:`, or `chore:`. Keep each commit focused and describe the user-visible change. PRs should explain the change, link a relevant issue when one exists, list verification commands, and include screenshots for UI changes. For release changes, include the package version and follow `docs/RELEASING.md`.

# Building release candidates

Use GitHub Actions for binaries that users will download. It builds on Windows and Linux runners, runs the same locked dependency install, and collects the results in one draft prerelease. Local maker commands are for checking a build on your own machine.

## Prepare a candidate

1. Commit and push the changes, including the desired `package.json` version.
2. Create and push a matching tag, such as `v0.1.0` for version `0.1.0`.
3. In the GitHub Actions tab, open **Build release candidate**, choose the tag in **Use workflow from**, and click **Run workflow**. The workflow checks the version, runs TypeScript and unit tests, builds a Windows Squirrel installer and Linux ZIP, and creates a **draft prerelease** with those two downloads and `SHA256SUMS`.
4. Download the release assets. Extract and run the Linux ZIP, or run the Windows installer and confirm the app appears in the Start menu. Check Rocket League connection, Twitch sign-in, and a live roster. Review the draft's notes and files before publishing it in GitHub Releases.

The workflow must be run from an existing version tag and rejects branch selections. It does not create a tag or publish the draft. If a draft already exists for the tag, delete the stale draft first or choose a new version/tag; the workflow does not replace release files.

## Local build commands

Run `pnpm install --frozen-lockfile` first. On Windows, use `pnpm make:windows`. On Linux, use `pnpm make:linux:zip`. Outputs are under `out/make/`. `pnpm package` creates an unpacked app for a quick local check.

Windows builds are currently unsigned. Treat the first binaries as a preview and complete signing before a broad stable release.

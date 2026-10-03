# Building release candidates

Use GitHub Actions for binaries that users will download. It builds on Windows and Linux runners, runs the same locked dependency install, and collects the results in one draft prerelease. Local maker commands are for checking a build on your own machine.

## Prepare a candidate

1. Commit and push the changes, including the desired `package.json` version.
2. Create and push a matching tag, such as `v0.1.0` for version `0.1.0`.
3. In the GitHub Actions tab, open **Build release candidate**, choose the tag in **Use workflow from**, and click **Run workflow**. The workflow checks the version, runs TypeScript and unit tests, builds a Windows Squirrel installer and Linux ZIP, and creates a **draft prerelease** with those downloads, the Windows update assets (`RELEASES` and `.nupkg` files), and `SHA256SUMS`.
4. Download the release assets. Extract and run the Linux ZIP, or run the Windows installer and confirm the app appears in the Start menu. Check Rocket League connection, Twitch sign-in, and a live roster. Review the draft's notes and files before publishing it in GitHub Releases.

The workflow must be run from an existing version tag and rejects branch selections. It does not create a tag or publish the draft. If a draft already exists for the tag, delete the stale draft first or choose a new version/tag; the workflow does not replace release files.

## Local build commands

Run `pnpm install --frozen-lockfile` first. On Windows, use `pnpm make:windows`. On Linux, use `pnpm make:linux:zip`. Outputs are under `out/make/`. `pnpm package` creates an unpacked app for a quick local check.

Windows builds are currently unsigned. Treat the first binaries as a preview and complete signing before a broad stable release.

## Windows self updates

Version 0.1.0 introduces self updates for Windows Squirrel installations. The app checks on startup (after a 30-second delay on the first launch after installation) and every four hours. Updates download in the background; a native dialog offers **Restart now** or **Later**. Choosing Later applies the update on the next app launch. Update failures are logged and retried at the next scheduled check. Development runs, unpacked builds, and other platforms do not check for updates.

The feed is `https://github.com/EMcCormack/RLStreamFinder/releases/latest/download`. It uses GitHub's latest stable release, so drafts and prereleases are excluded. Keep the repository public and retain the generated `RELEASES` manifest and every package it references as assets on the same release. The release workflow uploads them together with the installer. Do not rename the `.nupkg` files: the manifest references their generated names.

To deliver an update, increase the package version, build and test the candidate, then publish it with **Set as a pre-release** unchecked and mark it as the latest release. Keep previews marked as prereleases to avoid distributing them through the stable feed. The first installer containing this updater must be installed manually by existing users.

Before publishing broadly, test on Windows with two increasing versions: install the earlier Squirrel build, publish the newer version's installer, `RELEASES`, and packages as the latest stable release, then launch the installed app. Confirm the restart prompt, both Restart now and Later behavior, the new installed version, and retained Twitch sign-in. Also check that an offline launch continues normally and retries later. See [Electron's autoUpdater documentation](https://www.electronjs.org/docs/latest/api/auto-updater) for Squirrel behavior.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { ensureLinuxDesktopEntry, LINUX_DESKTOP_NAME, LINUX_DEV_DESKTOP_NAME } from "../src/main/services/linux-desktop-entry";
import { isKdeWayland } from "../src/main/services/kde-shortcut-portal";

test("creates a desktop entry with the packaged executable and portal identity", async () => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), "rl-desktop-entry-"));
  try {
    await ensureLinuxDesktopEntry("/opt/RL Stream Finder/rl-stream-finder", "/opt/RL Stream Finder/resources/icon.png", dataHome);
    const entry = await readFile(path.join(dataHome, "applications", LINUX_DESKTOP_NAME), "utf8");
    expect(entry).toContain('Exec="/opt/RL Stream Finder/rl-stream-finder"');
    expect(entry).toContain("Name=RLStreamFinder");
    expect(entry).toContain("Icon=/opt/RL Stream Finder/resources/icon.png");
  } finally {
    await rm(dataHome, { recursive: true, force: true });
  }
});

test("creates a separate development desktop entry for Wayland shortcuts", async () => {
  const dataHome = await mkdtemp(path.join(os.tmpdir(), "rl-desktop-entry-"));
  try {
    await ensureLinuxDesktopEntry("/repo/node_modules/electron/dist/electron", "/repo/assets/icon.png", dataHome, LINUX_DEV_DESKTOP_NAME, ["/repo"]);
    const entry = await readFile(path.join(dataHome, "applications", LINUX_DEV_DESKTOP_NAME), "utf8");
    const ozoneArgument = isKdeWayland() ? '"--ozone-platform=x11" ' : "";
    expect(entry).toContain(`Exec="/repo/node_modules/electron/dist/electron" ${ozoneArgument}"/repo"`);
    expect(entry).toContain("Icon=/repo/assets/icon.png");
  } finally {
    await rm(dataHome, { recursive: true, force: true });
  }
});

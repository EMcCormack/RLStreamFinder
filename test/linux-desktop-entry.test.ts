import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { ensureLinuxDesktopEntry, LINUX_DESKTOP_NAME } from "../src/main/services/linux-desktop-entry";

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

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const LINUX_DESKTOP_NAME = "com.emcormack.rlstreamfinder.desktop";

function desktopExecArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\$/g, "\\$").replace(/`/g, "\\`")}"`;
}

export async function ensureLinuxDesktopEntry(executablePath: string, iconPath: string, dataHome = process.env.XDG_DATA_HOME): Promise<void> {
  const baseDirectory = dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(os.homedir(), ".local", "share");
  const applicationsDirectory = path.join(baseDirectory, "applications");
  await mkdir(applicationsDirectory, { recursive: true });
  const content = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=RLStreamFinder",
    `Exec=${desktopExecArgument(executablePath)}`,
    `Icon=${iconPath}`,
    "Categories=Game;Utility;",
    "Terminal=false",
    "",
  ].join("\n");
  try {
    await writeFile(path.join(applicationsDirectory, LINUX_DESKTOP_NAME), content, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

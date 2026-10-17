import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const LINUX_DESKTOP_NAME = "com.emcormack.rlstreamfinder.desktop";
export const LINUX_DEV_DESKTOP_NAME = "com.emcormack.rlstreamfinder.dev.desktop";

function desktopExecArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\$/g, "\\$").replace(/`/g, "\\`")}"`;
}

export async function ensureLinuxDesktopEntry(
  executablePath: string,
  iconPath: string,
  dataHome = process.env.XDG_DATA_HOME,
  desktopName = LINUX_DESKTOP_NAME,
  execArgs: string[] = [],
): Promise<void> {
  const baseDirectory = dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(os.homedir(), ".local", "share");
  const applicationsDirectory = path.join(baseDirectory, "applications");
  await mkdir(applicationsDirectory, { recursive: true });
  const content = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=RLStreamFinder",
    `Exec=${[executablePath, ...execArgs].map(desktopExecArgument).join(" ")}`,
    `Icon=${iconPath}`,
    "Categories=Game;Utility;",
    "Terminal=false",
    "",
  ].join("\n");
  try {
    await writeFile(path.join(applicationsDirectory, desktopName), content, { flag: desktopName === LINUX_DEV_DESKTOP_NAME ? "w" : "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

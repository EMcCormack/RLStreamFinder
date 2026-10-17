import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OVERLAY_SHORTCUT, DEFAULT_PANEL_TRANSPARENCY, normalizeOverlayShortcut, validatePanelTransparency } from "../../shared/overlay-settings";

type SetupPreferences = {
  completed?: boolean;
  launchWithRocketLeague?: boolean;
  overlayShortcut?: string;
  panelTransparency?: number;
};

async function readPreferences(userDataDirectory: string): Promise<SetupPreferences> {
  try {
    const preferences = JSON.parse(await readFile(path.join(userDataDirectory, "setup.json"), "utf8"));
    return preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writePreferences(userDataDirectory: string, preferences: SetupPreferences): Promise<void> {
  await mkdir(userDataDirectory, { recursive: true });
  const filePath = path.join(userDataDirectory, "setup.json");
  await writeFile(`${filePath}.tmp`, JSON.stringify(preferences), "utf8");
  await rename(`${filePath}.tmp`, filePath);
}

export async function getSetupCompleted(userDataDirectory: string): Promise<boolean> {
  return (await readPreferences(userDataDirectory)).completed === true;
}

export async function completeSetup(userDataDirectory: string): Promise<void> {
  await writePreferences(userDataDirectory, { ...await readPreferences(userDataDirectory), completed: true });
}

export async function getLaunchWithRocketLeague(userDataDirectory: string): Promise<boolean> {
  return (await readPreferences(userDataDirectory)).launchWithRocketLeague === true;
}

export async function setLaunchWithRocketLeague(userDataDirectory: string, enabled: boolean): Promise<void> {
  await writePreferences(userDataDirectory, { ...await readPreferences(userDataDirectory), launchWithRocketLeague: enabled });
}

export async function getOverlayPreferences(userDataDirectory: string): Promise<{ shortcut: string; panelTransparency: number }> {
  const preferences = await readPreferences(userDataDirectory);
  let shortcut = DEFAULT_OVERLAY_SHORTCUT;
  let panelTransparency = DEFAULT_PANEL_TRANSPARENCY;
  try {
    if (preferences.overlayShortcut) shortcut = normalizeOverlayShortcut(preferences.overlayShortcut);
  } catch {
    // Ignore an invalid shortcut and keep the default.
  }
  try {
    if (preferences.panelTransparency !== undefined) panelTransparency = validatePanelTransparency(preferences.panelTransparency);
  } catch {
    // Ignore an invalid transparency value and keep the default.
  }
  return { shortcut, panelTransparency };
}

export async function setOverlayPreferences(userDataDirectory: string, shortcut: string, panelTransparency: number): Promise<void> {
  const normalizedShortcut = normalizeOverlayShortcut(shortcut);
  validatePanelTransparency(panelTransparency);
  await writePreferences(userDataDirectory, { ...await readPreferences(userDataDirectory), overlayShortcut: normalizedShortcut, panelTransparency });
}

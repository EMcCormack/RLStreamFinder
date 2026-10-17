import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type SetupPreferences = {
  completed?: boolean;
  launchWithRocketLeague?: boolean;
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

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function getSetupCompleted(userDataDirectory: string): Promise<boolean> {
  try {
    const preferences = JSON.parse(await readFile(path.join(userDataDirectory, "setup.json"), "utf8"));
    return preferences?.completed === true;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}

export async function completeSetup(userDataDirectory: string): Promise<void> {
  await mkdir(userDataDirectory, { recursive: true });
  const filePath = path.join(userDataDirectory, "setup.json");
  await writeFile(`${filePath}.tmp`, JSON.stringify({ completed: true }), "utf8");
  await rename(`${filePath}.tmp`, filePath);
}

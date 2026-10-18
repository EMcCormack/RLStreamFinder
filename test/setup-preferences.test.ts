import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { completeSetup, getLaunchWithRocketLeague, getOverlayPreferences, getSetupCompleted, setLaunchWithRocketLeague, setOverlayPreferences } from "../src/main/services/setup-preferences";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function profile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rl-onboarding-"));
  directories.push(directory);
  return directory;
}

test("shows setup for a new profile and remembers completion across reads", async () => {
  const directory = path.join(await profile(), "new-profile");
  expect(await getSetupCompleted(directory)).toBe(false);
  await completeSetup(directory);
  expect(await getSetupCompleted(directory)).toBe(true);
  expect(JSON.parse(await readFile(path.join(directory, "setup.json"), "utf8"))).toEqual({ completed: true });
});

test("requires explicit completion and recovers from malformed preferences", async () => {
  const directory = await profile();
  for (const content of ["broken json", "null", '{"completed":"true"}', '{"completed":false}']) {
    await writeFile(path.join(directory, "setup.json"), content);
    expect(await getSetupCompleted(directory)).toBe(false);
  }
  await completeSetup(directory);
  expect(await getSetupCompleted(directory)).toBe(true);
});

test("keeps Windows startup off until enabled and preserves it through setup completion", async () => {
  const directory = await profile();
  expect(await getLaunchWithRocketLeague(directory)).toBe(false);
  await completeSetup(directory);
  expect(await getLaunchWithRocketLeague(directory)).toBe(false);
  await setLaunchWithRocketLeague(directory, true);
  expect(await getLaunchWithRocketLeague(directory)).toBe(true);
  await completeSetup(directory);
  expect(JSON.parse(await readFile(path.join(directory, "setup.json"), "utf8"))).toEqual({ completed: true, launchWithRocketLeague: true });
  await setLaunchWithRocketLeague(directory, false);
  expect(await getSetupCompleted(directory)).toBe(true);
  expect(await getLaunchWithRocketLeague(directory)).toBe(false);
});

test("treats malformed and old setup preferences as startup disabled", async () => {
  const directory = await profile();
  for (const content of ["broken json", "null", '{"completed":true}', '{"launchWithRocketLeague":"true"}']) {
    await writeFile(path.join(directory, "setup.json"), content);
    expect(await getLaunchWithRocketLeague(directory)).toBe(false);
  }
});

test("remembers the overlay shortcut and transparency without clearing other preferences", async () => {
  const directory = await profile();
  expect(await getOverlayPreferences(directory)).toEqual({ shortcut: "CommandOrControl+Alt+R", panelTransparency: 8 });
  await setLaunchWithRocketLeague(directory, true);
  await setOverlayPreferences(directory, "Ctrl+Shift+Y", 35);
  await completeSetup(directory);
  expect(await getOverlayPreferences(directory)).toEqual({ shortcut: "Control+Shift+Y", panelTransparency: 35 });
  expect(await getLaunchWithRocketLeague(directory)).toBe(true);
  expect(await getSetupCompleted(directory)).toBe(true);
});

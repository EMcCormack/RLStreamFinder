import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { completeSetup, getSetupCompleted } from "../src/main/services/setup-preferences";

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

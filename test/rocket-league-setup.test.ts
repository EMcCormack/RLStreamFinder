import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { configureStatsIni, findDefaultRocketLeagueInstallation, findDefaultRocketLeagueInstallations, setupRocketLeagueStats } from "../src/main/services/rocket-league-setup";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function installation() {
  const root = await mkdtemp(path.join(os.tmpdir(), "rl-setup-"));
  directories.push(root);
  const config = path.join(root, "TAGame", "Config");
  await mkdir(config, { recursive: true });
  return { root, config };
}

test("updates exporter settings while preserving unrelated sections and comments", () => {
  const source = "[Other]\r\nPort=12\r\n[TAGame.MatchStatsExporter_TA]\r\nPort=0 ; disabled\r\nPacketSendRate=0\r\nWebPort=49123\r\nCustom=true\r\n[Next]\r\nPort=123\r\n";
  const result = configureStatsIni(source);
  expect(result).toContain("[Other]\r\nPort=12");
  expect(result).toContain("Port=49123 ; disabled\r\nPacketSendRate=10\r\nWebPort=49124\r\nCustom=true");
  expect(result).toContain("[Next]\r\nPort=123");
  expect(configureStatsIni(result)).toBe(result);
});

test("inserts missing keys inside the exporter section and creates missing section", () => {
  expect(configureStatsIni("[TAGame.MatchStatsExporter_TA]\nCustom=1\n[Other]\n"))
    .toContain("Custom=1\nPort=49123\nPacketSendRate=10\n[Other]");
  expect(configureStatsIni("[Other]\nPort=0\n")).toContain("[TAGame.MatchStatsExporter_TA]\nPort=49123\nPacketSendRate=10");
});

test("prefers TAStatsAPI.ini, preserves UTF-16 BOM, and backs up original bytes", async () => {
  const { root, config } = await installation();
  const original = Buffer.from("\uFEFF[TAGame.MatchStatsExporter_TA]\r\nPort=0\r\nPacketSendRate=0\r\n", "utf16le");
  await writeFile(path.join(config, "TAStatsAPI.ini"), original);
  await writeFile(path.join(config, "DefaultStatsAPI.ini"), "leave untouched");
  expect((await setupRocketLeagueStats(root)).configured).toBe(true);
  expect(await readFile(path.join(config, "DefaultStatsAPI.ini"), "utf8")).toBe("leave untouched");
  expect(await readFile(path.join(config, "TAStatsAPI.ini"), "utf16le")).toContain("\uFEFF[TAGame.MatchStatsExporter_TA]\r\nPort=49123");
  const backups = (await readdir(config)).filter((name) => name.includes(".backup-"));
  expect(backups).toHaveLength(1);
  expect(await readFile(path.join(config, backups[0]))).toEqual(original);
  expect((await setupRocketLeagueStats(root)).message).toContain("already configured");
  expect((await readdir(config)).filter((name) => name.includes(".backup-"))).toHaveLength(1);
});

test("falls back to DefaultStatsAPI.ini and rejects folders without configuration", async () => {
  const { root, config } = await installation();
  await expect(setupRocketLeagueStats(root)).rejects.toThrow("No Stats API configuration found");
  expect(await readdir(config)).toEqual([]);
  await writeFile(path.join(config, "DefaultStatsAPI.ini"), "[TAGame.MatchStatsExporter_TA]\nPacketSendRate=0\n");
  await setupRocketLeagueStats(root);
  expect(await readFile(path.join(config, "DefaultStatsAPI.ini"), "utf8")).toContain("PacketSendRate=10");
});

test("finds a default Steam installation and otherwise leaves selection to the caller", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "rl-home-"));
  directories.push(home);
  const install = path.join(home, ".local", "share", "Steam", "steamapps", "common", "rocketleague");
  expect(await findDefaultRocketLeagueInstallation({ platform: "linux", home })).toBeNull();
  await mkdir(path.join(install, "TAGame", "Config"), { recursive: true });
  await writeFile(path.join(install, "TAGame", "Config", "DefaultStatsAPI.ini"), "[Other]\n");
  expect(await findDefaultRocketLeagueInstallation({ platform: "linux", home })).toBe(install);
});

test("finds a Heroic Rocket League installation on Linux", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "rl-heroic-home-"));
  directories.push(home);
  const install = path.join(home, "Games", "Heroic", "Rocket League");
  await mkdir(path.join(install, "TAGame", "Config"), { recursive: true });
  await writeFile(path.join(install, "TAGame", "Config", "DefaultStatsAPI.ini"), "[Other]\n");
  await mkdir(path.join(home, ".config", "heroic"), { recursive: true });
  await writeFile(path.join(home, ".config", "heroic", "gamesConfig.json"), JSON.stringify({
    "Rocket League": { install_path: install },
  }));

  expect(await findDefaultRocketLeagueInstallation({ platform: "linux", home })).toBe(install);
});

test("finds both Steam and Epic installations on Windows", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rl-windows-"));
  directories.push(root);
  const steam = path.join(root, "Steam", "steamapps", "common", "rocketleague");
  const epic = path.join(root, "Epic Games", "rocketleague");
  for (const install of [steam, epic]) {
    const config = path.join(install, "TAGame", "Config");
    await mkdir(config, { recursive: true });
    await writeFile(path.join(config, "DefaultStatsAPI.ini"), "[TAGame.MatchStatsExporter_TA]\nPort=0\n");
  }

  const installations = await findDefaultRocketLeagueInstallations({
    platform: "win32",
    env: { "PROGRAMFILES(X86)": root },
  });

  expect(installations).toEqual([steam, epic]);
  await Promise.all(installations.map((install) => setupRocketLeagueStats(install)));
  for (const install of installations) {
    expect(await readFile(path.join(install, "TAGame", "Config", "DefaultStatsAPI.ini"), "utf8"))
      .toContain("Port=49123");
  }
});

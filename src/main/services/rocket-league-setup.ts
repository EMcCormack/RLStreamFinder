import path from "node:path";
import os from "node:os";
import { constants } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const STATS_SECTION = "tagame.matchstatsexporter_ta";

/** Update only the exporter section; leave unrelated game settings intact. */
export function configureStatsIni(source: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  let inside = false;
  let found = false;
  let keys = new Set<string>();
  const output: string[] = [];
  function completeSection() {
    if (!inside) return;
    if (!keys.has("port")) output.push("Port=49123");
    if (!keys.has("packetsendrate")) output.push("PacketSendRate=10");
  }
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/);
    if (section) {
      completeSection();
      inside = section[1].toLowerCase() === STATS_SECTION;
      found ||= inside;
      keys = new Set();
    }
    const setting = inside && line.match(/^(\s*)(Port|PacketSendRate|WebPort)\s*=\s*([^;#]*)(.*)$/i);
    if (setting) {
      const key = setting[2].toLowerCase();
      keys.add(key);
      const value = key === "port" ? "49123" : key === "packetsendrate" ? "10"
        : setting[3].trim() === "49123" ? "49124" : setting[3].trim();
      output.push(`${setting[1]}${setting[2]}=${value}${setting[4] ? ` ${setting[4]}` : ""}`);
    } else {
      output.push(line);
    }
  }
  completeSection();
  if (!found) output.push("", "[TAGame.MatchStatsExporter_TA]", "Port=49123", "PacketSendRate=10");
  return output.join(newline).replace(/(?:\r?\n)*$/, newline);
}

async function isExistingFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isRocketLeagueName(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().replace(/[^a-z0-9]/g, "").includes("rocketleague");
}

function collectHeroicInstallPaths(value: unknown, keyHint = "", paths: string[] = []): string[] {
  if (!value || typeof value !== "object") return paths;
  if (Array.isArray(value)) {
    for (const entry of value) collectHeroicInstallPaths(entry, keyHint, paths);
    return paths;
  }

  const record = value as Record<string, unknown>;
  const identity = [keyHint, record.appName, record.app_name, record.name, record.title, record.appId, record.appid]
    .some(isRocketLeagueName);
  if (identity) {
    for (const field of [record.install_path, record.installPath, record.installDir, record.installDirectory]) {
      if (typeof field === "string") paths.push(field);
    }
  }
  for (const [key, entry] of Object.entries(record)) {
    collectHeroicInstallPaths(entry, key, paths);
  }
  return paths;
}

async function findHeroicRocketLeagueInstallations(home: string): Promise<string[]> {
  const metadataPaths = [
    path.join(home, ".config", "heroic", "gamesConfig.json"),
    path.join(home, ".config", "heroic", "legendaryConfig", "legendaryInstalled.json"),
    path.join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic", "gamesConfig.json"),
    path.join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic", "legendaryConfig", "legendaryInstalled.json"),
  ];
  const installations: string[] = [];
  for (const metadataPath of metadataPaths) {
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      installations.push(...collectHeroicInstallPaths(metadata));
    } catch (error) {
      if (error.code !== "ENOENT") continue;
    }
  }
  return installations;
}


/** Find standard Steam or Epic installations that contain the Stats API config. */
export async function findDefaultRocketLeagueInstallations({
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
}: {
  platform?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<string[]> {
  const candidates: string[] = [];
  if (platform === "win32") {
    for (const base of [env["PROGRAMFILES(X86)"], env.PROGRAMFILES, env["ProgramW6432"]]) {
      if (!base) continue;
      candidates.push(path.join(base, "Steam", "steamapps", "common", "rocketleague"));
      candidates.push(path.join(base, "Epic Games", "rocketleague"));
    }
  } else if (platform === "linux") {
    for (const steamRoot of [
      path.join(home, ".local", "share", "Steam"),
      path.join(home, ".steam", "steam"),
      path.join(home, ".steam", "root"),
      path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
    ]) {
      candidates.push(path.join(steamRoot, "steamapps", "common", "rocketleague"));
    }
    candidates.push(...await findHeroicRocketLeagueInstallations(home));
  }
  const installations: string[] = [];
  for (const candidate of new Set(candidates)) {
    const config = path.join(candidate, "TAGame", "Config");
    if (await isExistingFile(path.join(config, "TAStatsAPI.ini")) ||
      await isExistingFile(path.join(config, "DefaultStatsAPI.ini"))) {
      installations.push(candidate);
    }
  }
  return installations;
}

export async function findDefaultRocketLeagueInstallation(options: Parameters<typeof findDefaultRocketLeagueInstallations>[0] = {}): Promise<string | null> {
  return (await findDefaultRocketLeagueInstallations(options))[0] ?? null;
}

export async function setupRocketLeagueStats(installDirectory: string) {
  const configDirectory = path.join(installDirectory, "TAGame", "Config");
  const preferredPath = path.join(configDirectory, "TAStatsAPI.ini");
  const fallbackPath = path.join(configDirectory, "DefaultStatsAPI.ini");
  const configPath = await isExistingFile(preferredPath) ? preferredPath
    : await isExistingFile(fallbackPath) ? fallbackPath : null;
  if (!configPath) {
    throw new Error("No Stats API configuration found. Choose the Rocket League installation folder containing TAGame/Config (not the Documents folder), or verify the game files in your launcher.");
  }

  const original = await readFile(configPath);
  const utf16 = original[0] === 0xff && original[1] === 0xfe;
  if (original[0] === 0xfe && original[1] === 0xff) {
    throw new Error("This configuration uses an unsupported encoding. Follow the manual setup steps instead.");
  }
  const encoding = utf16 ? "utf16le" : "utf8";
  const decoded = original.toString(encoding);
  const bom = decoded.startsWith("\uFEFF") ? "\uFEFF" : "";
  const updated = Buffer.from(bom + configureStatsIni(decoded.replace(/^\uFEFF/, "")), encoding);
  if (original.equals(updated)) {
    return { configured: true, message: "Stats API is already configured. Restart Rocket League, join a match, then click Connect RL." };
  }

  // Keep an untouched backup for every edit, and never replace an existing backup.
  const backupPath = `${configPath}.backup-${randomUUID()}`;
  await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
  await writeFile(configPath, updated);
  return {
    configured: true,
    message: `Stats API configured. Backup saved at ${backupPath}. Restart Rocket League, join a match, then click Connect RL.`,
  };
}

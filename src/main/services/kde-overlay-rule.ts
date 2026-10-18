import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function isKdeDesktop(environment: NodeJS.ProcessEnv = process.env): boolean {
  return process.platform === "linux" && (environment.XDG_CURRENT_DESKTOP ?? "")
    .split(":").some((desktop) => desktop.toLowerCase() === "kde");
}

type KdeOverlayRulePlan = {
  id: string;
  order: string;
  windowClass: string;
};

function readSections(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const line of content.split(/\r?\n/)) {
    const section = /^\[([^\]]+)\]$/.exec(line.trim());
    if (section) {
      current = new Map();
      sections.set(section[1], current);
      continue;
    }
    const separator = line.indexOf("=");
    if (current && separator > 0) current.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return sections;
}

export function planKdeOverlayRule(config: string, windowClass: string): KdeOverlayRulePlan | null {
  const sections = readSections(config);
  const order = (sections.get("General")?.get("Order") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const managedId = windowClass.endsWith(".dev") ? "rlstreamfinder-overlay-dev" : "rlstreamfinder-overlay";
  const existing = order.some((id) => {
    const rule = sections.get(id);
    return rule?.get("wmclass") === windowClass && rule.get("wmclassmatch") === "1" &&
      rule.get("layer") === "overlay" && rule.get("layerrule") === "2";
  });
  if (existing) return null;
  return { id: managedId, order: [managedId, ...order.filter((id) => id !== managedId)].join(","), windowClass };
}

export async function ensureKdeOverlayRule(desktopName: string, configHome = process.env.XDG_CONFIG_HOME): Promise<boolean> {
  const windowClass = desktopName.replace(/\.desktop$/, "");
  const configDirectory = configHome && path.isAbsolute(configHome) ? configHome : path.join(os.homedir(), ".config");
  const configFile = path.join(configDirectory, "kwinrulesrc");
  const content = await readFile(configFile, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const plan = planKdeOverlayRule(content, windowClass);
  if (!plan) return false;

  async function write(group: string, key: string, value: string): Promise<void> {
    await execFileAsync("kwriteconfig6", ["--file", configFile, "--group", group, "--key", key, value], { timeout: 5000 });
  }

  await write(plan.id, "Description", `RLStreamFinder overlay (${windowClass})`);
  await write(plan.id, "wmclass", plan.windowClass);
  await write(plan.id, "wmclassmatch", "1");
  await write(plan.id, "layer", "overlay");
  await write(plan.id, "layerrule", "2");
  await write("General", "Order", plan.order);
  await execFileAsync("qdbus6", ["org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure"], { timeout: 5000 });
  return true;
}

import { existsSync } from "node:fs";
import type { EventEmitter } from "node:events";
import path from "node:path";
import type { AutoUpdater, MessageBoxOptions } from "electron";

const WINDOWS_UPDATE_FEED = "https://github.com/EMcCormack/RLStreamFinder/releases/latest/download";
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

interface WindowsUpdateOptions {
  isPackaged: boolean;
  updater: Pick<AutoUpdater, "setFeedURL" | "checkForUpdates" | "quitAndInstall">
    & Pick<EventEmitter, "on" | "removeListener">;
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
  platform?: NodeJS.Platform;
  execPath?: string;
  argv?: string[];
  logError?: (error: unknown) => void;
}

/** Start only for a Squirrel installation; unpacked Windows builds have no Update.exe. */
export function startWindowsUpdates({
  isPackaged,
  updater,
  showMessageBox,
  platform = process.platform,
  execPath = process.execPath,
  argv = process.argv,
  logError = (error) => console.warn("Application update failed:", error),
}: WindowsUpdateOptions): () => void {
  if (platform !== "win32" || !isPackaged
    || argv.some((argument) => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(argument))
    || !existsSync(path.resolve(path.dirname(execPath), "..", "Update.exe"))) {
    return () => {};
  }

  let stopped = false;
  let checking = false;
  let downloaded = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;

  function onError(error: unknown) {
    checking = false;
    logError(error);
  }

  function onUpdateNotAvailable() {
    checking = false;
  }

  async function onUpdateDownloaded() {
    if (stopped || downloaded) return;
    downloaded = true;
    checking = false;
    clearInterval(interval);

    try {
      const { response } = await showMessageBox({
        type: "info",
        title: "RLStreamFinder update ready",
        message: "A new version of RLStreamFinder has been downloaded.",
        detail: "Restart now to install it, or keep using the app and the update will apply the next time you start it.",
        buttons: ["Restart now", "Later"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (!stopped && response === 0) updater.quitAndInstall();
    } catch (error) {
      logError(error);
    }
  }

  function checkForUpdates() {
    if (stopped || checking || downloaded) return;
    checking = true;
    try {
      updater.checkForUpdates();
    } catch (error) {
      onError(error);
    }
  }

  function stop() {
    stopped = true;
    clearTimeout(startupTimer);
    clearInterval(interval);
    updater.removeListener("error", onError);
    updater.removeListener("update-not-available", onUpdateNotAvailable);
    updater.removeListener("update-downloaded", onUpdateDownloaded);
  }

  updater.on("error", onError);
  updater.on("update-not-available", onUpdateNotAvailable);
  updater.on("update-downloaded", onUpdateDownloaded);

  try {
    updater.setFeedURL({ url: WINDOWS_UPDATE_FEED });
    // Squirrel holds an installation lock on first launch. Let it finish before checking.
    startupTimer = setTimeout(() => {
      interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
      checkForUpdates();
    }, argv.includes("--squirrel-firstrun") ? FIRST_RUN_DELAY_MS : 0);
  } catch (error) {
    onError(error);
    stop();
  }

  return stop;
}

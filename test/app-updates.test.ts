import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import type { MessageBoxOptions } from "electron";
import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { startWindowsUpdates } from "../src/main/services/app-updates";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

class TestUpdater extends EventEmitter {
  setFeedURL = vi.fn();
  checkForUpdates = vi.fn();
  quitAndInstall = vi.fn();
}

let updater: TestUpdater;
let showMessageBox: Mock<(options: MessageBoxOptions) => Promise<{ response: number }>>;
let logError: Mock<(error: unknown) => void>;
let stop: (() => void) | undefined;

function start(overrides = {}) {
  stop = startWindowsUpdates({
    isPackaged: true,
    platform: "win32",
    execPath: "/installed/app-0.1.0/rl-stream-finder.exe",
    argv: [],
    updater,
    showMessageBox,
    logError,
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(existsSync).mockReturnValue(true);
  updater = new TestUpdater();
  showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
  logError = vi.fn();
});

afterEach(() => {
  stop?.();
  vi.clearAllMocks();
  vi.useRealTimers();
});

test.each([
  { platform: "linux" },
  { platform: "darwin" },
  { isPackaged: false },
  ...["install", "updated", "uninstall", "obsolete"].map((event) => ({ argv: [`--squirrel-${event}`] })),
])("does not start updates outside a normal packaged Windows launch: %j", async (options) => {
  start(options);
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
  expect(updater.setFeedURL).not.toHaveBeenCalled();
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
});

test("skips unpacked Windows builds without Squirrel's Update.exe", () => {
  vi.mocked(existsSync).mockReturnValue(false);
  start();
  expect(existsSync).toHaveBeenCalledWith("/installed/Update.exe");
  expect(updater.setFeedURL).not.toHaveBeenCalled();
});

test("checks the stable release feed at startup and every four hours", async () => {
  start();
  expect(updater.setFeedURL).toHaveBeenCalledWith({
    url: "https://github.com/EMcCormack/RLStreamFinder/releases/latest/download",
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  updater.emit("update-not-available");
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test("waits for Squirrel's first-run installation lock before checking", async () => {
  start({ argv: ["--squirrel-firstrun"] });
  await vi.advanceTimersByTimeAsync(29_999);
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test("does not overlap checks while a download is pending", async () => {
  start();
  await vi.advanceTimersByTimeAsync(0);
  updater.emit("update-available");
  await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test.each([true, false])("logs update failures and retries, synchronous failure: %s", async (synchronous) => {
  const error = new Error("Offline");
  if (synchronous) updater.checkForUpdates.mockImplementationOnce(() => { throw error; });
  start();
  await vi.advanceTimersByTimeAsync(0);
  if (!synchronous) updater.emit("error", error);
  expect(logError).toHaveBeenCalledWith(error);
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test.each([0, 1])("prompts once after download and honors restart response %s", async (response) => {
  showMessageBox.mockResolvedValue({ response });
  start();
  await vi.advanceTimersByTimeAsync(0);
  expect(showMessageBox).not.toHaveBeenCalled();
  updater.emit("update-downloaded");
  updater.emit("update-downloaded");
  await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
  expect(showMessageBox).toHaveBeenCalledTimes(1);
  expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
    buttons: ["Restart now", "Later"], defaultId: 1, cancelId: 1,
  }));
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(response === 0 ? 1 : 0);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test("handles a failed restart dialog without an unhandled rejection", async () => {
  const error = new Error("Dialog failed");
  showMessageBox.mockRejectedValue(error);
  start();
  updater.emit("update-downloaded");
  await vi.advanceTimersByTimeAsync(0);
  expect(logError).toHaveBeenCalledWith(error);
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

test("stops timers and removes listeners during shutdown", async () => {
  start({ argv: ["--squirrel-firstrun"] });
  stop();
  await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  expect(updater.eventNames()).toEqual([]);
});

test("does not restart if shutdown occurs while the prompt is open", async () => {
  let resolvePrompt: (value: { response: number }) => void;
  showMessageBox.mockReturnValue(new Promise((resolve) => { resolvePrompt = resolve; }));
  start();
  updater.emit("update-downloaded");
  stop();
  resolvePrompt({ response: 0 });
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
});

test("handles feed initialization failure without starting checks", async () => {
  const error = new Error("Cannot configure updates");
  updater.setFeedURL.mockImplementation(() => { throw error; });
  start();
  await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
  expect(logError).toHaveBeenCalledWith(error);
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  expect(updater.eventNames()).toEqual([]);
});

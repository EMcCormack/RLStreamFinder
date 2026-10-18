import { mkdirSync } from "node:fs";
import path from "node:path";
import type { TestInfo } from "@playwright/test";
import { _electron as electron } from "playwright";

const appRoot = path.resolve(process.cwd());

export async function launchTestElectron(testInfo: TestInfo) {
  const userDataDir = testInfo.outputPath("user-data");
  mkdirSync(userDataDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
    RL_STREAM_FINDER_E2E_USER_DATA_DIR: userDataDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const args = [appRoot];
  if (process.platform === "linux") {
    // Use X11/XWayland so smoke runs do not create persistent KDE portal shortcuts.
    args.unshift("--ozone-platform=x11");
    env.XDG_SESSION_TYPE = "x11";
    delete env.WAYLAND_DISPLAY;
    delete env.WAYLAND_SOCKET;
  }

  const electronApp = await electron.launch({ args, cwd: appRoot, env });
  const actualUserDataDir = await electronApp.evaluate(({ app }) => app.getPath("userData"));
  if (actualUserDataDir !== userDataDir) {
    await electronApp.close();
    throw new Error(`Electron test profile was not isolated: ${actualUserDataDir}`);
  }
  return electronApp;
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const appRoot = path.resolve(process.cwd());
const screenshotPath = path.join(appRoot, "docs/screenshots/live-match-demo.png");
const previewDirectory = path.join(appRoot, "test/e2e/fixtures/stream-previews");

function previewDataUrl(filename: string) {
  return `data:image/jpeg;base64,${readFileSync(path.join(previewDirectory, filename)).toString("base64")}`;
}

const demoResults = {
  MustyTTV: {
    matchedLogin: "musty",
    displayName: "Musty",
    isLive: false,
    thumbnailUrl: null,
  },
  TenacityTV: {
    matchedLogin: "tenacitytv",
    displayName: "TenacityTV",
    isLive: true,
    thumbnailUrl: previewDataUrl("tenacitytv.jpg"),
  },
  AlphaKepTV: {
    matchedLogin: "alphakep",
    displayName: "AlphaKep",
    isLive: true,
    thumbnailUrl: previewDataUrl("alphakep.jpg"),
  },
};

test("captures the fixed Musty, TenacityTV, and AlphaKepTV demo", async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;

  const electronApp = await electron.launch({ args: [appRoot], cwd: appRoot, env });
  try {
    const page = await electronApp.firstWindow();
    await page.setViewportSize({ width: 1280, height: 820 });
    await electronApp.evaluate(({ ipcMain }, results) => {
      const snapshot = {
        matchGuid: "SCREENSHOT-DEMO",
        playerNames: ["MustyTTV", "TenacityTV", "AlphaKepTV"],
        players: [
          { Name: "You", TeamNum: 0, isCurrentPlayer: true },
          { Name: "MustyTTV", TeamNum: 0 },
          { Name: "TenacityTV", TeamNum: 1 },
          { Name: "AlphaKepTV", TeamNum: 1 },
        ],
        teams: [
          { Name: "Blue", TeamNum: 0 },
          { Name: "Orange", TeamNum: 1 },
        ],
      };
      for (const channel of ["twitch:verify", "players:check", "rocket-league:connect", "rocket-league:status"]) {
        ipcMain.removeHandler(channel);
      }
      ipcMain.handle("twitch:verify", () => ({ login: "demo-viewer" }));
      ipcMain.handle("players:check", (_event, playerNames) => playerNames.map((playerName) => {
        const result = results[playerName];
        return {
          playerName,
          matchedLogin: result.matchedLogin,
          displayName: result.displayName,
          url: `https://www.twitch.tv/${result.matchedLogin}`,
          isLive: result.isLive,
          hasTtvHint: true,
          lookupAttempted: true,
          confidence: 0.98,
          reason: "Exact channel match",
          title: null,
          thumbnailUrl: result.thumbnailUrl,
        };
      }));
      ipcMain.handle("rocket-league:connect", () => ({ connected: true, address: "demo", snapshot }));
      ipcMain.handle("rocket-league:status", () => ({ connected: true, address: "demo", snapshot }));
    }, demoResults);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByText("MustyTTV").first()).toBeVisible();
    await expect(page.getByText("TenacityTV").first()).toBeVisible();
    await expect(page.getByText("AlphaKepTV").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "twitch.tv/tenacitytv" })).toBeVisible();
    await expect(page.getByRole("link", { name: "twitch.tv/alphakep" })).toBeVisible();
    await expect(page.getByRole("link", { name: "twitch.tv/musty" })).toBeVisible();
    await expect(page.getByAltText("tenacitytv stream thumbnail")).toBeVisible();
    await expect(page.getByAltText("alphakep stream thumbnail")).toBeVisible();
    await page.locator("img[alt$='stream thumbnail']").evaluateAll(async (images) => {
      await Promise.all(images.map((image: HTMLImageElement) => image.decode()));
    });
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
  } finally {
    await electronApp.close();
  }
});

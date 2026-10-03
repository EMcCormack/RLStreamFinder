import { test, expect } from "@playwright/test";
import { launchTestElectron } from "./launch-electron";

async function installSmokeIpcMocks(electronApp, identitySource = "explicit", skipSetup = true) {
  if (skipSetup) {
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("setup:status");
      ipcMain.handle("setup:status", () => true);
    });
  }
  await electronApp.evaluate(({ ipcMain }, localPlayerIdentitySource) => {
    const snapshot = {
      matchGuid: "PLAYWRIGHT-SMOKE-001",
      arena: "Playwright Arena",
      timeSeconds: 284,
      overtime: false,
      winner: null,
      localPlayerIdentitySource,
      playerNames: ["GarrettG_TTV", "CoolGuy123", "LocalTTV"],
      players: [
        {
          Name: "GarrettG_TTV",
          TeamNum: 0,
          Score: 420,
          Goals: 1,
          Saves: 2,
        },
        {
          Name: "CoolGuy123",
          TeamNum: 1,
          Score: 250,
          Goals: 0,
          Saves: 1,
        },
        {
          Name: "LocalTTV",
          TeamNum: 0,
          isCurrentPlayer: true,
        },
      ],
      teams: [
        { Name: "Blue", TeamNum: 0, Score: 1 },
        { Name: "Orange", TeamNum: 1, Score: 0 },
      ],
    };

    const mockResultsFor = (playerNames) =>
      playerNames.map((playerName) => {
        const hasTtvHint = /ttv/i.test(playerName);
        const matchedLogin = playerName === "GarrettG_TTV" ? "garrettg" : "coolguy123";
        return {
          playerName,
          matchedLogin,
          displayName: playerName,
          url: `https://www.twitch.tv/${matchedLogin}`,
          isLive: true,
          followerCount: matchedLogin === "garrettg" ? 12345 : 678,
          viewerCount: matchedLogin === "garrettg" ? 456 : 12,
          hasTtvHint,
          lookupAttempted: true,
          confidence: hasTtvHint ? 0.98 : 1,
          reason: hasTtvHint ? "Exact cleaned login match" : "Exact login match",
          title: "Illustrative Rocket League stream",
          thumbnailUrl: null,
        };
      });

    for (const channel of [
      "twitch:start-auth",
      "twitch:complete-auth",
      "twitch:verify",
      "players:check",
      "rocket-league:connect",
      "rocket-league:disconnect",
      "rocket-league:status",
      "rocket-league:load-players",
    ]) {
      ipcMain.removeHandler(channel);
    }

    ipcMain.handle("twitch:start-auth", async () => ({
      verificationUri: "https://www.twitch.tv/activate",
      userCode: "SMOKE1",
    }));
    ipcMain.handle("twitch:complete-auth", async () => ({ login: "smoke-user" }));
    ipcMain.handle("twitch:verify", async () => ({ login: "smoke-user" }));
    ipcMain.handle("players:check", async (_event, playerNames) => {
      if (playerNames.includes("LocalTTV")) throw new Error("Local player was sent to Twitch lookup");
      return mockResultsFor(playerNames);
    });
    ipcMain.handle("rocket-league:connect", async () => ({
      connected: true,
      address: "playwright-smoke",
      snapshot,
    }));
    ipcMain.handle("rocket-league:disconnect", async () => ({
      connected: false,
      address: null,
      snapshot: null,
    }));
    ipcMain.handle("rocket-league:status", async () => ({
      connected: true,
      address: "playwright-smoke",
      snapshot,
    }));
    ipcMain.handle("rocket-league:load-players", async () => snapshot);
  }, identitySource);
}

test("guides first launch through setup and remembers completion after restarting", async ({}, testInfo) => {
  let electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    await installSmokeIpcMocks(electronApp, "explicit", false);
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("twitch:verify");
      ipcMain.handle("twitch:verify", () => { throw new Error("Not signed in"); });
      ipcMain.removeHandler("rocket-league:setup-availability");
      ipcMain.handle("rocket-league:setup-availability", () => ({ supported: true, installationCount: 1 }));
      let attempts = 0;
      ipcMain.removeHandler("rocket-league:setup");
      ipcMain.handle("rocket-league:setup", () => {
        attempts += 1;
        if (attempts === 1) return { configured: false, canceled: true, message: "Setup canceled. No settings were changed." };
        if (attempts === 2) throw new Error("Configuration could not be written.");
        return { configured: true, message: "Stats API configured. Restart Rocket League." };
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Find the streamers in your match." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live Match Scanner" })).toHaveCount(0);
    await expect(page.getByText("Found Rocket League. Automatic setup is available. Close the game before continuing.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("first-launch-setup.png"), fullPage: true });
    await page.getByRole("button", { name: "Set up automatically", exact: true }).click();
    await expect(page.getByText("Setup canceled. No settings were changed.")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Find the streamers in your match." })).toBeVisible();
    await page.getByRole("button", { name: "Set up automatically", exact: true }).click();
    await expect(page.getByText("Configuration could not be written.")).toBeVisible();
    await page.getByRole("button", { name: "Set up automatically", exact: true }).click();
    await expect(page.getByText("Configuration saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Connect Twitch", exact: true }).click();
    await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open match scanner", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Live Match Scanner" })).toBeVisible();
    await electronApp.close();
    electronApp = await launchTestElectron(testInfo);
    await expect((await electronApp.firstWindow()).getByRole("heading", { name: "Live Match Scanner" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("adapts setup to missing installations, unsupported platforms, and detection failures", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    for (const state of ["missing", "unsupported", "failed"]) {
      await electronApp.evaluate(({ ipcMain }, state) => {
        ipcMain.removeHandler("rocket-league:setup-availability");
        ipcMain.handle("rocket-league:setup-availability", () => {
          if (state === "failed") throw new Error("Unable to read installation folders");
          return { supported: state !== "unsupported", installationCount: 0 };
        });
        ipcMain.removeHandler("rocket-league:setup");
        ipcMain.handle("rocket-league:setup", () => ({ configured: false, canceled: true, message: "Setup canceled. No settings were changed." }));
      }, state);
      await page.reload({ waitUntil: "domcontentloaded" });
      if (state === "unsupported") {
        await expect(page.getByText(/Automatic setup supports Windows and Linux/)).toBeVisible();
        await expect(page.getByRole("button", { name: "Set up automatically", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Manual setup and troubleshooting" }).click();
        await expect(page.getByRole("dialog", { name: "Rocket League setup and troubleshooting" })).toBeVisible();
        await page.getByRole("button", { name: "Close troubleshooting" }).click();
      } else {
        const button = page.getByRole("button", { name: state === "missing" ? "Choose installation folder" : "Try automatic setup", exact: true });
        await expect(button).toBeEnabled();
        await button.click();
        await expect(page.getByText("Setup canceled. No settings were changed.")).toBeVisible();
      }
    }
  } finally {
    await electronApp.close();
  }
});

test("allows first-launch setup to be finished later", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { name: "Find the streamers in your match." })).toBeVisible();
    await page.getByRole("button", { name: "Open match scanner", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Live Match Scanner" })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Live Match Scanner" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("launches Electron, renders the app, exposes preload bridge, and automatically scans mocked players", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);

  try {
    const page = await electronApp.firstWindow();
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible())).toBe(false);
    await installSmokeIpcMocks(electronApp, "camera");
    await page.addInitScript(() => localStorage.setItem("rocket-league-viewer:streamers:v1", JSON.stringify({
      items: [{ playerName: "LocalTTV", matchedLogin: "localttv", isLive: true, hasTtvHint: true, confidence: 1 }],
      dismissed: [],
    })));
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Live Match Scanner" })).toBeVisible();
    const headerConnections = page.locator("header").getByRole("region", { name: "Connections" });
    await expect(headerConnections).toBeVisible();
    const connectionBox = await headerConnections.boundingBox();
    const titleBox = await page.getByRole("heading", { name: "Live Match Scanner" }).boundingBox();
    expect(connectionBox.x).toBeGreaterThan(titleBox.x);
    await expect(page.getByText("Tracked Matches", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Win Streak", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Session stats", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Current Players" })).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toBeVisible();

    const bridgeShape = await page.evaluate(() => {
      const bridge = window.rocketLeagueViewer;
      return {
        exists: !!bridge,
        startTwitchAuth: typeof bridge?.startTwitchAuth,
        completeTwitchAuth: typeof bridge?.completeTwitchAuth,
        verifyTwitch: typeof bridge?.verifyTwitch,
        checkPlayers: typeof bridge?.checkPlayers,
        connectRocketLeague: typeof bridge?.connectRocketLeague,
        setupRocketLeague: typeof bridge?.setupRocketLeague,
        disconnectRocketLeague: typeof bridge?.disconnectRocketLeague,
        getRocketLeagueStatus: typeof bridge?.getRocketLeagueStatus,
        loadRocketLeaguePlayers: typeof bridge?.loadRocketLeaguePlayers,
        onRocketLeagueUpdate: typeof bridge?.onRocketLeagueUpdate,
      };
    });

    expect(bridgeShape).toEqual({
      exists: true,
      startTwitchAuth: "function",
      completeTwitchAuth: "function",
      verifyTwitch: "function",
      checkPlayers: "function",
      connectRocketLeague: "function",
      setupRocketLeague: "function",
      disconnectRocketLeague: "function",
      getRocketLeagueStatus: "function",
      loadRocketLeaguePlayers: "function",
      onRocketLeagueUpdate: "function",
    });

    await expect(page.getByText("GarrettG_TTV").first()).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByText("LocalTTV", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rocket-league-viewer:streamers:v1") || "{}").items?.some((item) => item.playerName === "LocalTTV"))).toBe(true);
    await expect(page.getByRole("button", { name: "Scan Twitch", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh Roster", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
    await expect(page.getByText("Scan new rosters automatically")).toHaveCount(0);
    await expect(page.getByText("playwright-smoke", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Confidence|Exact cleaned login match|Exact login match/)).toHaveCount(0);
    await expect(page.getByText("Live").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /twitch\.tv\/garrettg/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "twitch.tv/coolguy123" })).toBeVisible();
    await expect(page.getByRole("complementary").getByText("12,345 followers · 456 viewers")).toBeVisible();
    await expect(page.getByRole("complementary").getByText("678 followers · 12 viewers")).toBeVisible();
    await expect(page.getByRole("button", { name: /Check name/i })).toHaveCount(0);

    await expect(page.getByAltText("garrettg stream thumbnail")).toHaveCount(0);
    await page.screenshot({ path: "test-results/live-match-demo.png" });
  } finally {
    await electronApp.close();
  }
});


test("disconnected connection cards open troubleshooting and automatic setup", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    await installSmokeIpcMocks(electronApp);
    await electronApp.evaluate(({ ipcMain }) => {
      for (const channel of ["rocket-league:status", "rocket-league:connect", "rocket-league:setup", "twitch:verify"]) {
        ipcMain.removeHandler(channel);
      }
      const disconnected = () => ({ connected: false, address: "127.0.0.1:49123", snapshot: null });
      ipcMain.handle("rocket-league:status", disconnected);
      ipcMain.handle("rocket-league:connect", disconnected);
      ipcMain.handle("twitch:verify", () => { throw new Error("Not signed in"); });
      ipcMain.handle("rocket-league:setup", () => ({ configured: true, message: "Stats API configured. Restart Rocket League." }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const connections = page.getByRole("region", { name: "Connections", exact: true });
    await expect(connections.getByRole("button", { name: "Connect RL", exact: true })).toBeVisible();
    await expect(connections.getByRole("button", { name: "Connect Twitch", exact: true })).toBeVisible();
    await expect(page.getByText("127.0.0.1:49123", { exact: true })).toHaveCount(0);
    await connections.getByRole("button", { name: "Rocket League setup and troubleshooting" }).click();
    const dialog = page.getByRole("dialog", { name: "Rocket League setup and troubleshooting" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Verify Rocket League is running on this computer.")).toBeVisible();
    await dialog.getByText("Manual setup instructions", { exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("TAGame/Config/TAStatsAPI.ini", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Set up automatically", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Stats API configured. Restart Rocket League.");
    await page.screenshot({ path: "test-results/connection-troubleshooting.png" });
    await dialog.getByRole("button", { name: "Close troubleshooting" }).click();
    await expect(dialog).toHaveCount(0);
    await connections.getByRole("button", { name: "Why connect Twitch?" }).click();
    const twitchHelp = page.getByRole("dialog", { name: "Why connect Twitch?" });
    await expect(twitchHelp).toContainText("Signing in to Twitch lets this app look up players’ Twitch channels");
    await expect(twitchHelp).toContainText("never asks for your password or extra Twitch permissions");
    await expect(twitchHelp).toContainText("Your sign-in is saved on this computer");
    await expect(twitchHelp).toContainText("sends possible Twitch names to Twitch");
    await twitchHelp.getByRole("button", { name: "Close Twitch help" }).click();
    await expect(twitchHelp).toHaveCount(0);
    await page.screenshot({ path: "test-results/connection-cards.png" });
  } finally {
    await electronApp.close();
  }
});

test("moves streamers below Previous Streamers when the board clears", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    await installSmokeIpcMocks(electronApp);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("smoke-history-cleared")) return;
      localStorage.clear();
      sessionStorage.setItem("smoke-history-cleared", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const streamers = page.getByRole("complementary");
    await expect(streamers.getByRole("button", { name: "Close GarrettG_TTV" })).toBeVisible();
    await page.clock.install();
    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send("rocket-league:update", {
        connected: true,
        snapshot: null,
      });
    });
    await expect(streamers.getByRole("button", { name: "Close GarrettG_TTV" })).toHaveCount(0);
    const previous = streamers.getByRole("region", { name: "Previous Streamers" });
    await expect(previous.getByText("GarrettG_TTV", { exact: true })).toBeVisible();
    await expect(previous.getByRole("link", { name: "twitch.tv/garrettg" })).toBeVisible();
    await expect(previous.getByText("Live", { exact: true })).toHaveCount(2);
    await expect(previous.getByText("12,345 followers · 456 viewers")).toBeVisible();
    await page.screenshot({ path: "test-results/previous-streamers.png" });
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(previous.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(previous.getByText("12,345 followers", { exact: true })).toBeVisible();
    await expect(previous.getByRole("link", { name: "twitch.tv/garrettg" })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("complementary").getByRole("button", { name: "Close GarrettG_TTV" })).toBeVisible();
    await page.getByRole("button", { name: "Close GarrettG_TTV" }).click();
    const dismissed = page.getByRole("region", { name: "Previous Streamers" });
    await expect(dismissed.getByText("GarrettG_TTV", { exact: true })).toBeVisible();
    await expect(dismissed.getByText("Live", { exact: true })).toHaveCount(1);
  } finally {
    await electronApp.close();
  }
});

test("keeps ten previous streamers in a five-row scroll area", async ({}, testInfo) => {
  const electronApp = await launchTestElectron(testInfo);
  try {
    const page = await electronApp.firstWindow();
    await installSmokeIpcMocks(electronApp);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("smoke-history-seeded")) return;
      const items = Array.from({ length: 12 }, (_, index) => ({
        playerName: `Previous${index}`,
        matchedLogin: `previous${index}`,
        url: `https://www.twitch.tv/previous${index}`,
        isLive: false,
        confidence: 1,
      }));
      localStorage.setItem("rocket-league-viewer:streamers:v1", JSON.stringify({ items, dismissed: [] }));
      sessionStorage.setItem("smoke-history-seeded", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    const previous = page.getByRole("region", { name: "Previous Streamers" });
    const list = previous.getByLabel("Previous streamer list");
    await expect(previous.locator(".min-h-16")).toHaveCount(10);
    await expect(previous.getByText("Previous9", { exact: true })).toBeAttached();
    await expect(previous.getByText("Previous10", { exact: true })).toHaveCount(0);
    const metrics = await list.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      firstItemHeight: element.firstElementChild?.getBoundingClientRect().height,
    }));
    expect(metrics.height).toBeGreaterThan(metrics.firstItemHeight * 4);
    expect(metrics.height).toBeLessThan(metrics.firstItemHeight * 6);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.height);
    const scrolled = await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const lastItem = element.lastElementChild.getBoundingClientRect();
      const listBounds = element.getBoundingClientRect();
      return element.scrollTop > 0 && lastItem.bottom <= listBounds.bottom;
    });
    expect(scrolled).toBe(true);
  } finally {
    await electronApp.close();
  }
});

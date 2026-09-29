import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { TWITCH_CLIENT_ID, TWITCH_SCOPES } from "./services/app-config";
import {
  RocketLeagueStatsClient,
  extractLiveMatchSnapshot,
  preserveMatchRoster,
} from "./services/rocket-league-stats";
import { findDefaultRocketLeagueInstallations, setupRocketLeagueStats } from "./services/rocket-league-setup";
import { RocketLeagueConnectionPoller } from "./services/rocket-league-poller";
import { Channels } from "../shared/ipc-contracts";
import { checkPlayers } from "../shared/pipeline";
import { TwitchApiError, TwitchAuthRequiredError, TwitchClient } from "./services/twitch";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const e2eUserDataDir = process.env.RL_STREAM_FINDER_E2E_USER_DATA_DIR;
if (e2eUserDataDir) {
  app.setPath("userData", e2eUserDataDir);
  app.setPath("sessionData", e2eUserDataDir);
}

if (squirrelStartup) {
  app.quit();
}

let mainWindow = null;
let rocketLeagueClient = null;
let rocketLeaguePoller: RocketLeagueConnectionPoller | null = null;
let latestRocketLeagueSnapshot = null;
let rocketLeagueDebugSequence = 0;
const ENCRYPTED_TOKEN_PREFIX = "electron-safe-storage:v1:";

function getPlayerNames(snapshot) {
  return (snapshot?.players ?? [])
    .map((player) => player?.Name)
    .filter(Boolean);
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    matchGuid: snapshot.matchGuid,
    isGameOver: snapshot.isGameOver,
    winner: snapshot.winner,
    playerCount: snapshot.players?.length ?? 0,
    playerNameCount: snapshot.playerNames?.length ?? 0,
    teamCount: snapshot.teams?.length ?? 0,
    players: getPlayerNames(snapshot),
    playerNames: snapshot.playerNames ?? [],
    teams: (snapshot.teams ?? []).map((team) => ({
      name: team?.Name,
      teamNum: team?.TeamNum,
      score: team?.Score,
    })),
  };
}

function summarizeUpdateState(data) {
  return {
    matchGuid: typeof data?.MatchGuid === "string" ? data.MatchGuid : null,
    eventPlayerCount: Array.isArray(data?.Players) ? data.Players.length : 0,
    eventPlayers: (Array.isArray(data?.Players) ? data.Players : [])
      .map((player) => player?.Name)
      .filter(Boolean),
    eventPlayerKeys: (Array.isArray(data?.Players) ? data.Players : [])
      .map((player) => Object.keys(player ?? {})),
    winner: data?.Game?.Winner ?? null,
    teamCount: Array.isArray(data?.Game?.Teams) ? data.Game.Teams.length : 0,
    teams: (Array.isArray(data?.Game?.Teams) ? data.Game.Teams : []).map((team) => ({
      name: team?.Name,
      teamNum: team?.TeamNum,
      score: team?.Score,
    })),
  };
}

function logRocketLeagueDebug(label, details = {}) {
  rocketLeagueDebugSequence += 1;
  console.info(`[RL_DEBUG main #${rocketLeagueDebugSequence}] ${label}`, details);
}

function stripFrameAncestors(directiveValue) {
  return directiveValue
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive && !directive.toLowerCase().startsWith("frame-ancestors"))
    .join("; ");
}

function registerTwitchEmbedHeaderPatch() {
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        "https://player.twitch.tv/*",
        "https://embed.twitch.tv/*",
        "https://www.twitch.tv/embed/*",
      ],
    },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() !== "content-security-policy") {
          continue;
        }

        responseHeaders[key] = responseHeaders[key].map(stripFrameAncestors);
      }

      callback({ responseHeaders });
    },
  );
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, "index.js");

  const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: "#111317",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath,
  });
  mainWindow.removeMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? MAIN_WINDOW_VITE_DEV_SERVER_URL;
    if (devServerUrl && url.startsWith(devServerUrl)) {
      return;
    }

    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (!message.includes("[RL_DEBUG renderer")) {
      return;
    }

    console.info(message, {
      level,
      line,
      sourceId,
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

function sendRocketLeagueSnapshot(snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    logRocketLeagueDebug("send skipped; main window unavailable", {
      outgoing: summarizeSnapshot(snapshot?.snapshot ?? snapshot),
    });
    return;
  }

  logRocketLeagueDebug("send renderer update", {
    connected: snapshot?.connected ?? null,
    hasError: Boolean(snapshot?.error),
    outgoing: summarizeSnapshot(snapshot?.snapshot ?? snapshot),
  });
  mainWindow.webContents.send(Channels.RL_UPDATE, snapshot);
}

function getOrCreateRocketLeagueClient() {
  if (rocketLeagueClient) {
    return rocketLeagueClient;
  }

  rocketLeagueClient = new RocketLeagueStatsClient();
  rocketLeagueClient.on("message", ({ event, data }) => {
    logRocketLeagueDebug("socket event", {
      event,
      updateState: event === "UpdateState" ? summarizeUpdateState(data) : null,
    });
  });
  rocketLeagueClient.on("UpdateState", (data) => {
    const previousSnapshot = latestRocketLeagueSnapshot;
    const extractedSnapshot = extractLiveMatchSnapshot(data);
    const nextSnapshot = extractedSnapshot?.isGameOver
      ? null
      : preserveMatchRoster(latestRocketLeagueSnapshot, extractedSnapshot);
    const preservedRoster = Boolean(extractedSnapshot && nextSnapshot && extractedSnapshot !== nextSnapshot);

    logRocketLeagueDebug("UpdateState snapshot", {
      previous: summarizeSnapshot(previousSnapshot),
      extracted: summarizeSnapshot(extractedSnapshot),
      preservedRoster,
      next: summarizeSnapshot(nextSnapshot),
    });

    latestRocketLeagueSnapshot = nextSnapshot;
    sendRocketLeagueSnapshot(getRocketLeagueConnectionState());
  });
  rocketLeagueClient.on("MatchCreated", (data) => {
    const matchGuid = typeof data?.MatchGuid === "string" ? data.MatchGuid : null;
    if (!matchGuid || latestRocketLeagueSnapshot?.matchGuid !== matchGuid) {
      latestRocketLeagueSnapshot = null;
      sendRocketLeagueSnapshot(getRocketLeagueConnectionState());
    }
  });
  rocketLeagueClient.on("MatchEnded", () => {
    latestRocketLeagueSnapshot = null;
    sendRocketLeagueSnapshot(getRocketLeagueConnectionState());
  });
  rocketLeagueClient.on("MatchDestroyed", () => {
    latestRocketLeagueSnapshot = null;
    sendRocketLeagueSnapshot(getRocketLeagueConnectionState());
  });
  rocketLeagueClient.on("disconnected", () => {
    logRocketLeagueDebug("socket disconnected", {
      previous: summarizeSnapshot(latestRocketLeagueSnapshot),
    });
    latestRocketLeagueSnapshot = null;
    sendRocketLeagueSnapshot(null);
  });
  rocketLeagueClient.on("error", (error) => {
    logRocketLeagueDebug("socket error", {
      message: formatRocketLeagueError(error),
      cached: summarizeSnapshot(latestRocketLeagueSnapshot),
    });
    sendRocketLeagueSnapshot({
      ...getRocketLeagueConnectionState(),
      error: formatRocketLeagueError(error),
    });
  });

  return rocketLeagueClient;
}

function getOrCreateRocketLeaguePoller() {
  if (rocketLeaguePoller) return rocketLeaguePoller;

  const client = getOrCreateRocketLeagueClient();
  rocketLeaguePoller = new RocketLeagueConnectionPoller(
    () => client.connected,
    () => client.connect(),
    () => sendRocketLeagueSnapshot(getRocketLeagueConnectionState()),
    (error) => {
      if (!isRocketLeagueUnavailableError(error)) {
        logRocketLeagueDebug("automatic connect failed", {
          message: formatRocketLeagueError(error),
        });
      }
    },
  );
  return rocketLeaguePoller;
}

function getRocketLeagueConnectionState() {
  return {
    connected: rocketLeagueClient?.connected ?? false,
    address: rocketLeagueClient?.address ?? null,
    snapshot: latestRocketLeagueSnapshot,
  };
}

function formatRocketLeagueError(error) {
  return error.message ?? "Unknown Rocket League stats error.";
}

function getTwitchDebugLogin() {
  const argumentIndex = process.argv.indexOf("--twitch-debug");
  if (argumentIndex < 0) {
    return null;
  }

  const firstValue = process.argv[argumentIndex + 1];
  return firstValue === "--" ? process.argv[argumentIndex + 2] : firstValue;
}

function isRocketLeagueUnavailableError(error) {
  return error?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(error?.message ?? "");
}

function createTokenCodec() {
  return {
    encode(tokenState) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Electron safe storage is unavailable.");
      }

      const rawJson = JSON.stringify(tokenState);
      const encrypted = safeStorage.encryptString(rawJson).toString("base64");
      return `${ENCRYPTED_TOKEN_PREFIX}${encrypted}\n`;
    },
    decode(rawPayload) {
      const trimmedPayload = rawPayload.trim();
      if (!trimmedPayload.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
        throw new Error("Stored Twitch token is not encrypted with Electron safe storage.");
      }

      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Electron safe storage is unavailable.");
      }

      const encrypted = Buffer.from(
        trimmedPayload.slice(ENCRYPTED_TOKEN_PREFIX.length),
        "base64",
      );
      return JSON.parse(safeStorage.decryptString(encrypted));
    },
  };
}

if (!squirrelStartup) app.whenReady().then(() => {
  registerTwitchEmbedHeaderPatch();
  let twitchClient: TwitchClient | null = null;
  function createTwitchClient() {
    twitchClient ??= new TwitchClient({
      clientId: TWITCH_CLIENT_ID,
      scopes: TWITCH_SCOPES,
      tokenStorePath: path.join(app.getPath("userData"), "twitch-auth.json"),
      tokenCodec: createTokenCodec(),
    });
    return twitchClient;
  }

  function formatTwitchError(error) {
    if (error instanceof TwitchAuthRequiredError) {
      return error.message;
    }

    if (error instanceof TwitchApiError) {
      const status = error.status ? ` (HTTP ${error.status})` : "";
      return `${error.message}${status}`;
    }

    return error.message ?? "Unknown Twitch error.";
  }

  const twitchDebugLogin = getTwitchDebugLogin();
  if (twitchDebugLogin) {
    createTwitchClient()
      .debugLookup(twitchDebugLogin)
      .then((result) => {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        app.quit();
      })
      .catch((error) => {
        console.error(JSON.stringify({
          ok: false,
          error: formatTwitchError(error),
        }, null, 2));
        process.exitCode = 1;
        app.quit();
      });
    return;
  }

  ipcMain.handle(Channels.TWITCH_START_AUTH, async () => {
    try {
      const flow = await createTwitchClient().startDeviceCodeFlow();
      await shell.openExternal(flow.verificationUri);
      return flow;
    } catch (error) {
      throw new Error(formatTwitchError(error));
    }
  });

  ipcMain.handle(Channels.TWITCH_COMPLETE_AUTH, async (_event, flow) => {
    try {
      const twitchClient = createTwitchClient();
      await twitchClient.pollForDeviceCodeAccessToken(flow);
      return await twitchClient.verifyCredentials();
    } catch (error) {
      throw new Error(formatTwitchError(error));
    }
  });

  ipcMain.handle(Channels.TWITCH_VERIFY, async () => {
    try {
      return await createTwitchClient().verifyCredentials();
    } catch (error) {
      throw new Error(formatTwitchError(error));
    }
  });

  ipcMain.handle(Channels.PLAYERS_CHECK, async (_event, playerNames) => {
    try {
      const localPlayerNames = new Set(
        (latestRocketLeagueSnapshot?.players ?? [])
          .filter((player) => player.isCurrentPlayer)
          .map((player) => String(player.Name ?? "").trim().toLowerCase()),
      );
      return await checkPlayers(
        createTwitchClient(),
        playerNames.filter(Boolean).map((name) => String(name).trim())
          .filter((name) => !localPlayerNames.has(name.toLowerCase())),
      );
    } catch (error) {
      throw new Error(formatTwitchError(error));
    }
  });

  ipcMain.handle(Channels.RL_SETUP, async () => {
    if (process.platform !== "win32" && process.platform !== "linux") {
      return { configured: false, message: "Automatic setup supports Windows and Linux Wine/Proton installations. Follow the manual steps on the computer running Rocket League." };
    }
    const defaultInstallations = await findDefaultRocketLeagueInstallations();
    let installDirectories = defaultInstallations;
    if (installDirectories.length === 0) {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: "Choose the Rocket League installation folder (contains TAGame)",
        buttonLabel: "Configure Stats API",
        properties: ["openDirectory"],
      });
      if (selection.canceled || !selection.filePaths[0]) {
        return { configured: false, canceled: true, message: "Setup canceled. No settings were changed." };
      }
      installDirectories = [selection.filePaths[0]];
    }
    try {
      const results = await Promise.all(installDirectories.map((installDirectory) => setupRocketLeagueStats(installDirectory)));
      const configuredCount = results.filter((result) => !result.message.includes("already configured")).length;
      const installationLabel = installDirectories.length === 1 ? "installation" : "installations";
      return {
        configured: true,
        message: configuredCount > 0
          ? `Stats API configured in ${configuredCount} of ${installDirectories.length} Rocket League ${installationLabel}. Restart Rocket League, join a match, then click Connect RL.`
          : `Stats API is already configured in all detected Rocket League ${installationLabel}. Restart Rocket League, join a match, then click Connect RL.`,
      };
    } catch (error) {
      if (error.code === "EACCES" || error.code === "EPERM") {
        throw new Error("Rocket League's configuration could not be written. Use the manual setup steps with a text editor that has permission to edit the installation folder.");
      }
      throw new Error(error.message ?? "Stats API setup failed. Follow the manual setup steps.");
    }
  });

  ipcMain.handle(Channels.RL_CONNECT, async () => {
    try {
      logRocketLeagueDebug("ipc RL_CONNECT start", {
        cached: summarizeSnapshot(latestRocketLeagueSnapshot),
      });
      const poller = getOrCreateRocketLeaguePoller();
      poller.start();
      await poller.connectNow();

      logRocketLeagueDebug("ipc RL_CONNECT return", {
        state: summarizeSnapshot(getRocketLeagueConnectionState().snapshot),
      });
      return getRocketLeagueConnectionState();
    } catch (error) {
      if (isRocketLeagueUnavailableError(error)) {
        logRocketLeagueDebug("ipc RL_CONNECT unavailable", {
          message: "Rocket League is not running",
        });
        return getRocketLeagueConnectionState();
      }

      logRocketLeagueDebug("ipc RL_CONNECT error", {
        message: formatRocketLeagueError(error),
      });
      throw new Error(formatRocketLeagueError(error));
    }
  });

  ipcMain.handle(Channels.RL_DISCONNECT, async () => {
    logRocketLeagueDebug("ipc RL_DISCONNECT start", {
      cached: summarizeSnapshot(latestRocketLeagueSnapshot),
    });
    rocketLeaguePoller?.stop();
    rocketLeaguePoller = null;
    if (rocketLeagueClient) {
      rocketLeagueClient.disconnect();
      rocketLeagueClient.removeAllListeners();
      rocketLeagueClient = null;
    }

    latestRocketLeagueSnapshot = null;
    logRocketLeagueDebug("ipc RL_DISCONNECT return", {
      cached: summarizeSnapshot(latestRocketLeagueSnapshot),
    });
    return getRocketLeagueConnectionState();
  });

  ipcMain.handle(Channels.RL_STATUS, async () => {
    logRocketLeagueDebug("ipc RL_STATUS return", {
      state: summarizeSnapshot(getRocketLeagueConnectionState().snapshot),
    });
    return getRocketLeagueConnectionState();
  });

  ipcMain.handle(Channels.RL_LOAD_PLAYERS, async () => {
    logRocketLeagueDebug("ipc RL_LOAD_PLAYERS return", {
      cached: summarizeSnapshot(latestRocketLeagueSnapshot),
    });
    return latestRocketLeagueSnapshot;
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    rocketLeaguePoller?.stop();
    rocketLeaguePoller = null;
    if (rocketLeagueClient) {
      rocketLeagueClient.disconnect();
      rocketLeagueClient = null;
    }

    app.quit();
  }
});

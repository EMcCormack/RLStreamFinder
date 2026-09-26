import * as net from "node:net";
import { EventEmitter } from "node:events";

export function decodeRocketLeagueEnvelope(rawJson) {
  let envelope;

  try {
    envelope = JSON.parse(rawJson);
  } catch {
    return null;
  }

  if (!envelope || typeof envelope.Event !== "string") {
    return null;
  }

  let data = null;
  if (typeof envelope.Data === "string") {
    try {
      data = JSON.parse(envelope.Data);
    } catch {
      data = envelope.Data;
    }
  } else if (envelope.Data !== undefined) {
    data = envelope.Data;
  }

  return {
    event: envelope.Event,
    data,
  };
}

function getFirstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

function getFirstId(...values) {
  const value = values.find((item) => typeof item === "string" || typeof item === "number");
  return value === undefined ? null : String(value).trim() || null;
}

function toReadableLabel(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value
    .replace(/_P$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getExplicitCurrentPlayer(updateState) {
  return updateState.CurrentPlayer
    ?? updateState.Player
    ?? updateState.Game?.CurrentPlayer
    ?? updateState.Game?.Player
    ?? null;
}

function getCurrentPlayerIdentity(updateState) {
  const explicitSource = getExplicitCurrentPlayer(updateState);
  const explicitId = getFirstId(updateState.CurrentPlayerId, updateState.LocalPlayerId);
  const explicitName = getFirstString(updateState.CurrentPlayerName, updateState.LocalPlayerName);
  const source = explicitSource ?? (explicitId || explicitName ? null : updateState.Game?.Target) ?? null;

  if (!source || typeof source !== "object") {
    return {
      id: explicitId,
      name: explicitName,
    };
  }

  return {
    id: getFirstId(source.PrimaryId, source.Id, source.UniqueId, source.PlayerId),
    name: getFirstString(source.Name, source.PlayerName),
  };
}

function hasLocalPlayerFlag(player) {
  return Boolean(
    player?.IsLocalPlayer
    || player?.bLocalPlayer
    || player?.bIsLocalPlayer
    || player?.LocalPlayer,
  );
}

function isCurrentPlayer(player, currentPlayer) {
  if (!player || typeof player !== "object") {
    return false;
  }

  if (hasLocalPlayerFlag(player)) {
    return true;
  }

  const playerId = getFirstId(player.PrimaryId, player.Id, player.UniqueId, player.PlayerId);
  const playerName = getFirstString(player.Name, player.PlayerName);

  return Boolean(
    (currentPlayer.id && playerId && currentPlayer.id === playerId)
    || (currentPlayer.name && playerName && currentPlayer.name === playerName),
  );
}

function getPlayerMergeKey(player) {
  if (!player || typeof player !== "object") {
    return null;
  }

  const id = getFirstId(player.PrimaryId, player.Id, player.UniqueId, player.PlayerId);
  if (id) {
    return `id:${id}`;
  }

  const name = getFirstString(player.Name, player.PlayerName);
  if (!name) {
    return null;
  }

  return `name:${name}|team:${getFirstId(player.TeamNum) ?? ""}`;
}

function mergePlayersByIdentity(previousPlayers = [], nextPlayers = []) {
  const mergedByKey = new Map();
  const unkeyedPlayers = [];

  for (const player of previousPlayers) {
    const key = getPlayerMergeKey(player);
    if (key) {
      mergedByKey.set(key, player);
    } else {
      unkeyedPlayers.push(player);
    }
  }

  for (const player of nextPlayers) {
    const key = getPlayerMergeKey(player);
    if (key) {
      mergedByKey.set(key, {
        ...(mergedByKey.get(key) ?? {}),
        ...player,
      });
    } else {
      unkeyedPlayers.push(player);
    }
  }

  return [...mergedByKey.values(), ...unkeyedPlayers];
}

export function preserveMatchRoster(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || !nextSnapshot) {
    return nextSnapshot;
  }

  if (
    previousSnapshot.matchGuid
    && nextSnapshot.matchGuid
    && previousSnapshot.matchGuid !== nextSnapshot.matchGuid
  ) {
    return nextSnapshot;
  }

  const previousPlayers = previousSnapshot.players ?? [];
  const nextPlayers = nextSnapshot.players ?? [];
  const previousPlayerNames = previousSnapshot.playerNames ?? [];
  const nextPlayerNames = nextSnapshot.playerNames ?? [];
  const previousTeams = previousSnapshot.teams ?? [];
  const nextTeams = nextSnapshot.teams ?? [];
  const rosterRegressed = previousPlayers.length > nextPlayers.length
    || previousPlayerNames.length > nextPlayerNames.length
    || previousTeams.length > nextTeams.length;

  // Game.Target follows the replay camera. Once we know who is local, keep
  // that identity for this match unless the feed supplies an explicit flag.
  const localPlayers = nextSnapshot.localPlayerIdentitySource === "explicit"
    ? nextPlayers.filter((player) => player.isCurrentPlayer)
    : previousPlayers.filter((player) => player.isCurrentPlayer);
  const players = (rosterRegressed
    ? mergePlayersByIdentity(previousPlayers, nextPlayers)
    : nextPlayers).map((player) => ({
    ...player,
    isCurrentPlayer: localPlayers.length
      ? localPlayers.some((localPlayer) => {
        const localId = getFirstId(localPlayer.PrimaryId, localPlayer.Id, localPlayer.UniqueId, localPlayer.PlayerId);
        const playerId = getFirstId(player.PrimaryId, player.Id, player.UniqueId, player.PlayerId);
        if (localId && playerId) {
          return localId === playerId;
        }
        const localName = getFirstString(localPlayer.Name, localPlayer.PlayerName);
        return Boolean(localName && localName === getFirstString(player.Name, player.PlayerName));
      })
      : player.isCurrentPlayer,
  }));

  return {
    ...nextSnapshot,
    matchGuid: nextSnapshot.matchGuid ?? previousSnapshot.matchGuid,
    winner: nextSnapshot.winner ?? previousSnapshot.winner,
    isGameOver: nextSnapshot.isGameOver || previousSnapshot.isGameOver,
    localPlayerIdentitySource: localPlayers.length
      ? (nextSnapshot.localPlayerIdentitySource === "explicit" ? "explicit" : previousSnapshot.localPlayerIdentitySource)
      : nextSnapshot.localPlayerIdentitySource,
    playerNames: [...new Set(players
      .filter((player) => !player.isCurrentPlayer)
      .map((player) => getFirstString(player.Name, player.PlayerName))
      .filter(Boolean))],
    players,
    teams: rosterRegressed && !nextTeams.length ? previousTeams : nextTeams,
  };
}

export class JsonFrameBuffer {
  buf: Buffer;

  constructor() {
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = this.buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buf, chunk]);
  }

  *drain() {
    let cursor = 0;

    while (cursor < this.buf.length) {
      while (cursor < this.buf.length && this.buf[cursor] !== 0x7b) {
        cursor += 1;
      }

      if (cursor >= this.buf.length) {
        break;
      }

      const start = cursor;
      let depth = 0;
      let inString = false;
      let escape = false;
      let end = -1;

      for (let index = start; index < this.buf.length; index += 1) {
        const byte = this.buf[index];

        if (escape) {
          escape = false;
          continue;
        }

        if (inString) {
          if (byte === 0x5c) {
            escape = true;
          } else if (byte === 0x22) {
            inString = false;
          }
          continue;
        }

        if (byte === 0x22) {
          inString = true;
        } else if (byte === 0x7b) {
          depth += 1;
        } else if (byte === 0x7d) {
          depth -= 1;
          if (depth === 0) {
            end = index;
            break;
          }
        }
      }

      if (end < 0) {
        break;
      }

      yield this.buf.subarray(start, end + 1).toString("utf8");
      cursor = end + 1;
    }

    this.buf = this.buf.subarray(cursor);
  }
}

export class RocketLeagueStatsClient {
  host: string;
  port: number;
  connectTimeoutMs: number;
  createConnection: (connectionOptions: net.NetConnectOpts) => net.Socket;
  socket: net.Socket | null;
  framer: JsonFrameBuffer;
  emitter: EventEmitter;
  manuallyClosed: boolean;

  constructor(options: any = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 49123;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.createConnection = options.createConnection ?? ((connectionOptions) => net.createConnection(connectionOptions));
    this.socket = null;
    this.framer = new JsonFrameBuffer();
    this.emitter = new EventEmitter();
    this.manuallyClosed = false;
  }

  get connected() {
    return !!this.socket && !this.socket.destroyed && this.socket.readyState === "open";
  }

  get address() {
    return `${this.host}:${this.port}`;
  }

  emitError(error) {
    if (this.emitter.listenerCount("error") > 0) {
      this.emitter.emit("error", error);
    }
  }

  connect() {
    this.manuallyClosed = false;

    return new Promise((resolve, reject) => {
      const socket = this.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      this.framer = new JsonFrameBuffer();

      let settled = false;
      let failedBeforeConnect = false;

      const cleanupConnectListeners = () => {
        clearTimeout(timeout);
        socket.off("connect", handleConnect);
      };

      const failConnect = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        failedBeforeConnect = true;
        cleanupConnectListeners();
        this.socket = null;
        this.framer = new JsonFrameBuffer();
        reject(error);
      };
      const timeout = setTimeout(() => {
        const error = new Error(`Connect timed out after ${this.connectTimeoutMs}ms`);
        failConnect(error);
        socket.destroy(error);
      }, this.connectTimeoutMs);

      const handleConnect = () => {
        settled = true;
        cleanupConnectListeners();
        this.emitter.emit("connected");
        resolve(undefined);
      };

      const handleData = (chunk) => {
        this.framer.push(chunk);

        for (const rawFrame of this.framer.drain()) {
          const decoded = decodeRocketLeagueEnvelope(rawFrame);
          if (!decoded) {
            this.emitter.emit("parseError", {
              error: new Error("Failed to decode Rocket League stats frame"),
              frame: rawFrame,
            });
            continue;
          }

          this.emitter.emit("message", decoded);
          this.emitter.emit(decoded.event, decoded.data);
        }
      };

      const handleError = (error) => {
        if (!settled) {
          failConnect(error);
          return;
        }

        this.emitError(error);
      };

      const handleClose = () => {
        cleanupConnectListeners();
        const wasFailedConnect = failedBeforeConnect;

        if (!settled) {
          failConnect(new Error("Rocket League stats socket closed before connecting."));
          return;
        }

        const wasManual = this.manuallyClosed;
        this.socket = null;
        this.framer = new JsonFrameBuffer();
        if (!wasFailedConnect) {
          this.emitter.emit("disconnected", { reason: wasManual ? "manual" : "closed" });
        }
      };

      socket.on("connect", handleConnect);
      socket.on("data", handleData);
      socket.on("error", handleError);
      socket.on("close", handleClose);
    });
  }

  disconnect() {
    this.manuallyClosed = true;

    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
      this.socket.destroy();
    }

    this.socket = null;
    this.framer = new JsonFrameBuffer();
  }

  on(event, listener) {
    this.emitter.on(event, listener);
    return this;
  }

  once(event, listener) {
    this.emitter.once(event, listener);
    return this;
  }

  off(event, listener) {
    this.emitter.off(event, listener);
    return this;
  }

  removeAllListeners() {
    this.emitter.removeAllListeners();
    return this;
  }
}

export function extractLiveMatchSnapshot(updateState) {
  if (!updateState || typeof updateState !== "object") {
    return null;
  }

  const players = Array.isArray(updateState.Players)
    ? updateState.Players
    : [];
  const teams = Array.isArray(updateState.Game?.Teams)
    ? updateState.Game.Teams
    : [];
  const currentPlayer = getCurrentPlayerIdentity(updateState);
  const hasExplicitLocalPlayer = players.some(hasLocalPlayerFlag);

  const playerNames = [];
  const seenNames = new Set();
  const enrichedPlayers = players.map((player) => ({
    ...player,
    isCurrentPlayer: hasExplicitLocalPlayer
      ? hasLocalPlayerFlag(player)
      : isCurrentPlayer(player, currentPlayer),
  }));

  for (const player of enrichedPlayers) {
    const name = typeof player?.Name === "string" ? player.Name.trim() : "";
    if (!name || seenNames.has(name) || player.isCurrentPlayer) {
      continue;
    }

    seenNames.add(name);
    playerNames.push(name);
  }

  return {
    matchGuid: typeof updateState.MatchGuid === "string" ? updateState.MatchGuid : null,
    arena: typeof updateState.Game?.Arena === "string" ? updateState.Game.Arena : null,
    stage: toReadableLabel(getFirstString(
      updateState.Game?.Stage,
      updateState.Game?.Map,
      updateState.Game?.MapName,
      updateState.Game?.Arena,
    )),
    gameMode: toReadableLabel(getFirstString(
      updateState.Game?.GameMode,
      updateState.Game?.Mode,
      updateState.Game?.Playlist,
      updateState.Game?.PlaylistName,
    )),
    timeSeconds: typeof updateState.Game?.TimeSeconds === "number" ? updateState.Game.TimeSeconds : null,
    overtime: Boolean(updateState.Game?.bOvertime),
    winner: getFirstId(updateState.Game?.Winner),
    isGameOver: Boolean(getFirstId(updateState.Game?.Winner)),
    localPlayerIdentitySource: enrichedPlayers.some((player) => player.isCurrentPlayer)
      ? (hasExplicitLocalPlayer || getExplicitCurrentPlayer(updateState)
        || getFirstId(updateState.CurrentPlayerId, updateState.LocalPlayerId)
        || getFirstString(updateState.CurrentPlayerName, updateState.LocalPlayerName) ? "explicit" : "camera")
      : null,
    playerNames,
    players: enrichedPlayers,
    teams,
  };
}

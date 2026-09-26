import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  RocketLeagueStatsClient,
  JsonFrameBuffer,
  decodeRocketLeagueEnvelope,
  extractLiveMatchSnapshot,
  preserveMatchRoster,
} from "../src/main/services/rocket-league-stats";

class FakeSocket extends EventEmitter {
  static instances = [];
  options: any;
  readyState: string;
  destroyed: boolean;

  constructor(options) {
    super();
    this.options = options;
    this.readyState = "opening";
    this.destroyed = false;
    FakeSocket.instances.push(this);
  }

  connect() {
    this.readyState = "open";
    this.emit("connect");
  }

  writeData(data) {
    this.emit("data", Buffer.from(data));
  }

  fail(error = new Error("boom")) {
    this.emit("error", error);
  }

  end() {
    this.readyState = "closed";
  }

  destroy() {
    this.destroyed = true;
    this.readyState = "closed";
    this.emit("close");
  }
}

function resetFakeSockets() {
  FakeSocket.instances = [];
}

function createFakeConnection(options) {
  return new FakeSocket(options);
}

test("decodeRocketLeagueEnvelope parses the official wire format", () => {
  const wire = JSON.stringify({
    Event: "UpdateState",
    Data: JSON.stringify({
      MatchGuid: "abc",
      Players: [],
      Game: { TimeSeconds: 60, Teams: [] },
    }),
  });

  assert.deepEqual(decodeRocketLeagueEnvelope(wire), {
    event: "UpdateState",
    data: {
      MatchGuid: "abc",
      Players: [],
      Game: { TimeSeconds: 60, Teams: [] },
    },
  });
});

test("JsonFrameBuffer yields concatenated JSON objects", () => {
  const buffer = new JsonFrameBuffer();
  buffer.push(Buffer.from(`{"a":1}{"b":2}{"c":3}`));

  assert.deepEqual([...buffer.drain()], [
    `{"a":1}`,
    `{"b":2}`,
    `{"c":3}`,
  ]);
});

test("RocketLeagueStatsClient connects to the official local socket endpoint", async () => {
  resetFakeSockets();
  const client = new RocketLeagueStatsClient({ createConnection: createFakeConnection });
  const connected = client.connect();
  const socket = FakeSocket.instances[0];

  assert.deepEqual(socket.options, { host: "127.0.0.1", port: 49123 });

  socket.connect();
  await connected;

  assert.equal(client.connected, true);
  client.disconnect();
});

test("RocketLeagueStatsClient emits decoded socket messages", async () => {
  resetFakeSockets();
  const client = new RocketLeagueStatsClient({ createConnection: createFakeConnection });
  const updates = [];
  client.on("UpdateState", (data) => updates.push(data));

  const connected = client.connect();
  const socket = FakeSocket.instances[0];
  socket.connect();
  await connected;

  socket.writeData(JSON.stringify({
    Event: "UpdateState",
    Data: { MatchGuid: "mock", Players: [] },
  }));

  assert.deepEqual(updates, [{ MatchGuid: "mock", Players: [] }]);
  client.disconnect();
});

test("RocketLeagueStatsClient rejects connection errors without requiring an error listener", async () => {
  resetFakeSockets();
  const client = new RocketLeagueStatsClient({ createConnection: createFakeConnection });
  const connected = assert.rejects(
    client.connect(),
    /boom/,
  );
  const socket = FakeSocket.instances[0];

  socket.fail(new Error("boom"));

  await connected;
});

test("RocketLeagueStatsClient rejects connection timeouts", async () => {
  resetFakeSockets();
  const client = new RocketLeagueStatsClient({
    createConnection: createFakeConnection,
    connectTimeoutMs: 1,
  });

  await assert.rejects(client.connect(), /Connect timed out after 1ms/);
});

test("extractLiveMatchSnapshot returns stable player names", () => {
  const snapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    CurrentPlayer: { Name: "Bravo" },
    Players: [
      { Name: "Alpha" },
      { Name: " Bravo " },
      { Name: "Alpha" },
    ],
    Game: {
      Arena: "Stadium_P",
      TimeSeconds: 180,
      bOvertime: false,
      Winner: "",
      Teams: [
        { Name: "Blue", TeamNum: 0, Score: 1 },
        { Name: "Orange", TeamNum: 1, Score: 0 },
      ],
    },
  });

  assert.deepEqual(snapshot, {
    matchGuid: "MOCK",
    arena: "Stadium_P",
    stage: "Stadium",
    gameMode: null,
    timeSeconds: 180,
    overtime: false,
    winner: null,
    isGameOver: false,
    localPlayerIdentitySource: "explicit",
    playerNames: ["Alpha"],
    players: [
      { Name: "Alpha", isCurrentPlayer: false },
      { Name: " Bravo ", isCurrentPlayer: true },
      { Name: "Alpha", isCurrentPlayer: false },
    ],
    teams: [
      { Name: "Blue", TeamNum: 0, Score: 1 },
      { Name: "Orange", TeamNum: 1, Score: 0 },
    ],
  });
});

test("extractLiveMatchSnapshot prefers an explicit local-player flag over the replay camera", () => {
  const snapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    CurrentPlayer: { Name: "Replay Target" },
    Players: [
      { Name: "Replay Target", PrimaryId: "target", TeamNum: 1 },
      { Name: "Actual Local", PrimaryId: "local", TeamNum: 0, IsLocalPlayer: true },
    ],
    Game: { Winner: 0, Teams: [] },
  });

  assert.equal(snapshot.players[0].isCurrentPlayer, false);
  assert.equal(snapshot.players[1].isCurrentPlayer, true);
  assert.deepEqual(snapshot.playerNames, ["Replay Target"]);
});

test("extractLiveMatchSnapshot identifies the local player from the official Game.Target field", () => {
  const snapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    Players: [
      { Name: "Actual Local", PrimaryId: "local", TeamNum: 0 },
      { Name: "Opponent", PrimaryId: "opponent", TeamNum: 1 },
    ],
    Game: {
      Target: { Name: "Actual Local", Shortcut: 1, TeamNum: 0 },
      Winner: "",
      Teams: [],
    },
  });

  assert.equal(snapshot.players[0].isCurrentPlayer, true);
  assert.equal(snapshot.players[1].isCurrentPlayer, false);
  assert.deepEqual(snapshot.playerNames, ["Opponent"]);
});

test("preserveMatchRoster keeps the live roster when replay updates only include one player", () => {
  const liveSnapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    CurrentPlayer: { Name: "Bravo" },
    Players: [
      { Name: "Alpha", PrimaryId: "alpha", TeamNum: 0, Score: 210 },
      { Name: "Bravo", PrimaryId: "bravo", TeamNum: 0, Score: 100 },
      { Name: "Charlie", PrimaryId: "charlie", TeamNum: 1, Score: 500 },
      { Name: "Delta", PrimaryId: "delta", TeamNum: 1, Score: 250 },
    ],
    Game: {
      TimeSeconds: 2,
      Winner: "",
      Teams: [
        { Name: "Blue", TeamNum: 0, Score: 2 },
        { Name: "Orange", TeamNum: 1, Score: 2 },
      ],
    },
  });
  const replaySnapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    Players: [
      { Name: "Charlie", PrimaryId: "charlie", TeamNum: 1, Score: 550, Goals: 3 },
    ],
    Game: {
      Target: { Name: "Charlie" },
      TimeSeconds: 0,
      Winner: 1,
      Teams: [
        { Name: "Blue", TeamNum: 0, Score: 2 },
        { Name: "Orange", TeamNum: 1, Score: 3 },
      ],
    },
  });

  const snapshot = preserveMatchRoster(liveSnapshot, replaySnapshot);

  assert.equal(snapshot.isGameOver, true);
  assert.equal(snapshot.winner, "1");
  assert.deepEqual(snapshot.teams, [
    { Name: "Blue", TeamNum: 0, Score: 2 },
    { Name: "Orange", TeamNum: 1, Score: 3 },
  ]);
  assert.deepEqual(snapshot.players.map((player) => player.Name), [
    "Alpha",
    "Bravo",
    "Charlie",
    "Delta",
  ]);
  assert.equal(snapshot.players.find((player) => player.Name === "Charlie").Goals, 3);
  assert.deepEqual(snapshot.players.filter((player) => player.isCurrentPlayer).map((player) => player.Name), ["Bravo"]);
  assert.deepEqual(snapshot.playerNames, ["Alpha", "Charlie", "Delta"]);
});

test("preserveMatchRoster keeps the roster for same-match non-game-over regressions", () => {
  const fullSnapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    CurrentPlayer: { Name: "Bravo" },
    Players: [
      { Name: "Alpha", PrimaryId: "alpha", TeamNum: 0 },
      { Name: "Bravo", PrimaryId: "bravo", TeamNum: 0 },
      { Name: "Charlie", PrimaryId: "charlie", TeamNum: 1 },
      { Name: "Delta", PrimaryId: "delta", TeamNum: 1 },
    ],
    Game: {
      TimeSeconds: 90,
      Winner: "",
      Teams: [
        { Name: "Blue", TeamNum: 0, Score: 1 },
        { Name: "Orange", TeamNum: 1, Score: 1 },
      ],
    },
  });
  const regressedSnapshot = extractLiveMatchSnapshot({
    MatchGuid: "MOCK",
    CurrentPlayer: { Name: "Bravo" },
    Players: [
      { Name: "Alpha", PrimaryId: "alpha", TeamNum: 0, Score: 300 },
    ],
    Game: {
      TimeSeconds: 89,
      Winner: "",
      Teams: [
        { Name: "Blue", TeamNum: 0, Score: 1 },
        { Name: "Orange", TeamNum: 1, Score: 1 },
      ],
    },
  });

  const snapshot = preserveMatchRoster(fullSnapshot, regressedSnapshot);

  assert.equal(snapshot.isGameOver, false);
  assert.equal(snapshot.timeSeconds, 89);
  assert.deepEqual(snapshot.players.map((player) => player.Name), [
    "Alpha",
    "Bravo",
    "Charlie",
    "Delta",
  ]);
  assert.equal(snapshot.players.find((player) => player.Name === "Alpha").Score, 300);
});

test("preserveMatchRoster resets the roster when a new match guid arrives", () => {
  const previousSnapshot = extractLiveMatchSnapshot({
    MatchGuid: "OLD",
    CurrentPlayer: { Name: "Bravo" },
    Players: [
      { Name: "Alpha", PrimaryId: "alpha", TeamNum: 0 },
      { Name: "Bravo", PrimaryId: "bravo", TeamNum: 0 },
      { Name: "Charlie", PrimaryId: "charlie", TeamNum: 1 },
      { Name: "Delta", PrimaryId: "delta", TeamNum: 1 },
    ],
    Game: { Winner: "", Teams: [] },
  });
  const nextSnapshot = extractLiveMatchSnapshot({
    MatchGuid: "NEW",
    CurrentPlayer: { Name: "Foxtrot" },
    Players: [
      { Name: "Echo", PrimaryId: "echo", TeamNum: 0 },
      { Name: "Foxtrot", PrimaryId: "foxtrot", TeamNum: 0 },
    ],
    Game: { Winner: "", Teams: [] },
  });

  const snapshot = preserveMatchRoster(previousSnapshot, nextSnapshot);

  assert.deepEqual(snapshot.players.map((player) => player.Name), ["Echo", "Foxtrot"]);
  assert.deepEqual(snapshot.playerNames, ["Echo"]);
});

test("preserveMatchRoster keeps local identity and scan candidates stable through full-roster replays", () => {
  const players = [
    { Name: "LocalTTV", PrimaryId: "local", TeamNum: 0 },
    { Name: "OpponentTTV", PrimaryId: "opponent", TeamNum: 1 },
  ];
  const live = extractLiveMatchSnapshot({
    MatchGuid: "MATCH",
    Players: players,
    Game: { Target: players[0] },
  });
  const replay = preserveMatchRoster(live, extractLiveMatchSnapshot({
    MatchGuid: "MATCH",
    Players: players,
    Game: { Target: players[1] },
  }));
  const missingTarget = preserveMatchRoster(replay, extractLiveMatchSnapshot({
    MatchGuid: "MATCH",
    Players: players.map((player) => ({ ...player, IsLocalPlayer: false })),
    Game: {},
  }));
  const resumed = preserveMatchRoster(missingTarget, live);

  for (const snapshot of [replay, missingTarget, resumed]) {
    assert.deepEqual(snapshot.players.map((player) => player.isCurrentPlayer), [true, false]);
    assert.deepEqual(snapshot.playerNames, ["OpponentTTV"]);
  }
});

test("preserveMatchRoster lets explicit local identity correct an initial camera target", () => {
  const players = [
    { Name: "LocalTTV", PrimaryId: "local" },
    { Name: "OpponentTTV", PrimaryId: "opponent" },
  ];
  const initial = extractLiveMatchSnapshot({
    MatchGuid: "MATCH", Players: players, Game: { Target: players[1] },
  });
  const corrected = preserveMatchRoster(initial, extractLiveMatchSnapshot({
    MatchGuid: "MATCH",
    Players: [{ ...players[0], IsLocalPlayer: true }, players[1]],
    Game: { Target: players[1] },
  }));
  assert.deepEqual(corrected.players.map((player) => player.isCurrentPlayer), [true, false]);
  assert.deepEqual(corrected.playerNames, ["OpponentTTV"]);
});

test("preserveMatchRoster retains match boundaries through sparse frames and resets local identity", () => {
  const players = [
    { Name: "SameName", PrimaryId: "old-local" },
    { Name: "NewLocal", PrimaryId: "new-local" },
  ];
  const initial = extractLiveMatchSnapshot({
    MatchGuid: "OLD", Players: players, Game: { Target: players[0] },
  });
  const sparse = preserveMatchRoster(initial, extractLiveMatchSnapshot({ Players: [] }));
  assert.equal(sparse.matchGuid, "OLD");
  const next = preserveMatchRoster(sparse, extractLiveMatchSnapshot({
    MatchGuid: "NEW", Players: players, Game: { Target: players[1] },
  }));
  assert.deepEqual(next.players.map((player) => player.isCurrentPlayer), [false, true]);
  assert.deepEqual(next.playerNames, ["SameName"]);
});

test("preserveMatchRoster accepts explicit identity after an initial camera fallback", () => {
  const players = [
    { Name: "LocalTTV", PrimaryId: "local" },
    { Name: "OpponentTTV", PrimaryId: "opponent" },
  ];
  const initial = extractLiveMatchSnapshot({
    MatchGuid: "MATCH", Players: players, Game: { Target: players[1] },
  });
  for (const identity of [
    { CurrentPlayer: players[0] },
    { LocalPlayerId: "local" },
    { LocalPlayerName: "LocalTTV" },
  ]) {
    const corrected = preserveMatchRoster(initial, extractLiveMatchSnapshot({
      MatchGuid: "MATCH", Players: players, Game: { Target: players[1] }, ...identity,
    }));
    const replay = preserveMatchRoster(corrected, extractLiveMatchSnapshot({
      MatchGuid: "MATCH", Players: players, Game: { Target: players[1] },
    }));
    assert.deepEqual(replay.players.map((player) => player.isCurrentPlayer), [true, false]);
    assert.deepEqual(replay.playerNames, ["OpponentTTV"]);
  }
});

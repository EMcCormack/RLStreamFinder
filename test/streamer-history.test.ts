import assert from "node:assert/strict";
import { hasRecentStreamStatus, limitPreviousStreamers, markStreamerDeparture, MAX_PREVIOUS_STREAMERS, RECENT_STREAM_STATUS_MS } from "../src/renderer/src/helpers/streamer-history";

test("departed streamers keep their last status for five minutes", () => {
  const departedAt = 1_000_000;
  const items = [
    { playerName: "AlphaKepTV", matchedLogin: "alphakep", isLive: true },
    { playerName: "MustyTTV", matchedLogin: "musty", isLive: false },
    { playerName: "UnknownTTV", matchedLogin: null, isLive: false },
  ];
  const updated = markStreamerDeparture(items, new Set(["alphakeptv", "mustyttv", "unknownttv"]), departedAt);

  assert.equal(updated[0].previousStatusExpiresAt, departedAt + RECENT_STREAM_STATUS_MS);
  assert.equal(updated[1].previousStatusExpiresAt, departedAt + RECENT_STREAM_STATUS_MS);
  assert.equal(updated[2].previousStatusExpiresAt, undefined);
  assert.equal(hasRecentStreamStatus(updated[0], departedAt + RECENT_STREAM_STATUS_MS - 1), true);
  assert.equal(hasRecentStreamStatus(updated[0], departedAt + RECENT_STREAM_STATUS_MS), false);
  assert.equal(hasRecentStreamStatus(updated[2], departedAt), false);
});

test("a later departure restarts the recent-status window", () => {
  const item = { playerName: "AlphaKepTV", matchedLogin: "alphakep", isLive: false, previousStatusExpiresAt: 20 };
  const [updated] = markStreamerDeparture([item], new Set(["alphakeptv"]), 100);

  assert.equal(updated.previousStatusExpiresAt, 100 + RECENT_STREAM_STATUS_MS);
  assert.equal(hasRecentStreamStatus(item, 100), false);
  assert.equal(hasRecentStreamStatus(updated, 100), true);
});

test("clearing the roster does not restart a dismissed streamer's status window", () => {
  const item = { playerName: "AlphaKepTV", matchedLogin: "alphakep", isLive: true, previousStatusExpiresAt: 200 };
  const [updated] = markStreamerDeparture([item], new Set(["alphakeptv"]), 150, new Set(["alphakep"]));

  assert.equal(updated.previousStatusExpiresAt, 200);
});


test("keeps ten most recent previous streamers alongside current streamers", () => {
  const items = Array.from({ length: 14 }, (_, index) => ({ playerName: `Player${index}`, matchedLogin: `player${index}` }));
  const kept = limitPreviousStreamers(items, new Set(["player1", "player12"]));

  assert.equal(MAX_PREVIOUS_STREAMERS, 10);
  assert.deepEqual(kept.map((item) => item.playerName), [
    "Player0", "Player1", "Player2", "Player3", "Player4", "Player5",
    "Player6", "Player7", "Player8", "Player9", "Player10", "Player12",
  ]);
});

test("dismissed current streamer counts toward previous history", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ playerName: `Player${index}`, matchedLogin: `player${index}` }));
  const kept = limitPreviousStreamers(items, new Set(["player0", "player11"]), new Set(["player0"]));

  assert.deepEqual(kept.map((item) => item.playerName), [
    "Player0", "Player1", "Player2", "Player3", "Player4", "Player5",
    "Player6", "Player7", "Player8", "Player9", "Player11",
  ]);
});

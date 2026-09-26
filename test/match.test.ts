import assert from "node:assert/strict";
import { test } from "vitest";
import { buildRosterKey, getScannablePlayerNames } from "../src/renderer/src/helpers/match";

test("scan candidates exclude the current player even when playerNames includes them", () => {
  const snapshot = {
    localPlayerIdentitySource: "explicit",
    playerNames: ["LocalTTV", "OpponentTTV", "AnotherPlayer"],
    players: [
      { Name: " localttv ", isCurrentPlayer: true },
      { Name: "OpponentTTV", isCurrentPlayer: false },
    ],
  };

  assert.deepEqual(getScannablePlayerNames(snapshot), ["OpponentTTV", "AnotherPlayer"]);
  assert.equal(buildRosterKey(snapshot), "AnotherPlayer\nOpponentTTV");
});

test("scan waits until a roster player is identified as You", () => {
  const snapshot = {
    playerNames: ["LocalTTV", "OpponentTTV"],
    players: [
      { Name: "LocalTTV", isCurrentPlayer: true },
      { Name: "OpponentTTV", isCurrentPlayer: false },
    ],
  };

  assert.deepEqual(getScannablePlayerNames({ ...snapshot, players: [] }), []);
  assert.equal(buildRosterKey({ ...snapshot, players: [] }), "");
  assert.deepEqual(getScannablePlayerNames({ ...snapshot, localPlayerIdentitySource: "camera" }), ["OpponentTTV"]);
  assert.deepEqual(getScannablePlayerNames({ ...snapshot, localPlayerIdentitySource: "explicit" }), ["OpponentTTV"]);
});

import assert from "node:assert/strict";
import {
  normalizeLoginCandidate,
  normalizeFuzzyName,
  stripStreamMarkers,
  buildPlayerCandidate,
  buildSearchQueries,
} from "../src/shared/players";
import { checkPlayers } from "../src/shared/pipeline";

test("normalizeLoginCandidate preserves underscores for Twitch-style login matching", () => {
  assert.equal(normalizeLoginCandidate("Cool_Guy_TTV"), "cool_guy_ttv");
  assert.equal(normalizeLoginCandidate("cool.guy tv"), "coolguytv");
});

test("normalizeFuzzyName strips punctuation for loose display matching", () => {
  assert.equal(normalizeFuzzyName("Cool_Guy_TTV"), "coolguyttv");
  assert.equal(normalizeFuzzyName("cool.guy tv"), "coolguytv");
});

test("stripStreamMarkers removes ttv and twitch markers cleanly", () => {
  assert.equal(stripStreamMarkers("cool_guy_ttv"), "cool_guy");
  assert.equal(stripStreamMarkers("twitchcoolguytv"), "coolguy");
});

test("buildPlayerCandidate keeps exact variants", () => {
  assert.deepEqual(buildPlayerCandidate("Cool_Guy_TTV"), {
    rawName: "Cool_Guy_TTV",
    loginCandidate: "cool_guy_ttv",
    cleanedLoginCandidate: "cool_guy",
    fuzzyName: "coolguyttv",
    cleanedFuzzyName: "coolguy",
    hasTtvHint: true,
  });
});

test("buildSearchQueries only includes exact login candidates", () => {
  const candidate = buildPlayerCandidate("Cool_Guy_TTV");

  assert.deepEqual(buildSearchQueries(candidate), [
    "cool_guy_ttv",
    "cool_guy",
  ]);
});

test("buildPlayerCandidate does not treat ordinary names as twitch hints", () => {
  assert.equal(buildPlayerCandidate("RATTATA-").hasTtvHint, false);
  assert.equal(buildPlayerCandidate("mega").hasTtvHint, false);
  assert.equal(buildPlayerCandidate("ttvClay-_- ").hasTtvHint, true);
  assert.equal(buildPlayerCandidate("CoolGuyTTV").hasTtvHint, true);
  assert.equal(buildPlayerCandidate("CoolGuy.tv").hasTtvHint, true);
});

test("checkPlayers looks up untagged names using only the raw login", async () => {
  const queries = [];
  const twitchClient = {
    async getLiveStreamByLogin(login) {
      queries.push(`live:${login}`);
      return null;
    },
    async getUserByLogin(login) {
      queries.push(`user:${login}`);
      return login === "rattata" ? {
        broadcasterLogin: "rattata",
        displayName: "Rattata",
        isLive: false,
        url: "https://www.twitch.tv/rattata",
      } : null;
    },
    async searchChannels() {
      throw new Error("should not search channels");
    },
  };

  const [result] = await checkPlayers(twitchClient, ["RATTATA-"]);

  assert.deepEqual(queries, ["live:rattata", "user:rattata"]);
  assert.equal(result.hasTtvHint, false);
  assert.equal(result.lookupAttempted, true);
  assert.equal(result.matchedLogin, "rattata");
  assert.equal(result.confidence, 1);
});

test("checkPlayers rejects partial matches for untagged names", async () => {
  const twitchClient = {
    async getLiveStreamByLogin() {
      return null;
    },
    async getUserByLogin() {
      return {
        broadcasterLogin: "rattataurufufu",
        displayName: "Rattataurufufu",
        isLive: false,
      };
    },
  };

  const [result] = await checkPlayers(twitchClient, ["RATTATA-"]);

  assert.equal(result.lookupAttempted, true);
  assert.equal(result.matchedLogin, null);
  assert.equal(result.reason, "no exact twitch match");
});

test("checkPlayers tries both raw and cleaned TTV logins", async () => {
  const queries = [];
  const twitchClient = {
    async getLiveStreamByLogin(login) {
      queries.push(`live:${login}`);
      return login === "cool_guy_ttv" ? {
        broadcasterLogin: login,
        displayName: "Cool_Guy_TTV",
        isLive: true,
        url: "https://www.twitch.tv/cool_guy_ttv",
      } : null;
    },
    async getUserByLogin(login) {
      queries.push(`user:${login}`);
      return null;
    },
  };

  const [result] = await checkPlayers(twitchClient, ["Cool_Guy_TTV"]);

  assert.deepEqual(queries, [
    "live:cool_guy_ttv",
    "user:cool_guy_ttv",
    "live:cool_guy",
    "user:cool_guy",
  ]);
  assert.equal(result.matchedLogin, "cool_guy_ttv");
  assert.equal(result.isLive, true);
});

test("checkPlayers accepts exact cleaned login matches for twitch-marked names", async () => {
  const twitchClient = {
    async getLiveStreamByLogin(login) {
      if (login === "cool_guy") {
        return {
          broadcasterLogin: "cool_guy",
          displayName: "Cool_Guy",
          isLive: true,
          title: "ranked",
          gameName: "Rocket League",
          thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_cool_guy-{width}x{height}.jpg",
          url: "https://www.twitch.tv/cool_guy",
        };
      }

      return null;
    },
    async getUserByLogin() {
      return null;
    },
    async searchChannels() {
      throw new Error("should not search channels");
    },
  };

  const [result] = await checkPlayers(twitchClient, ["Cool_Guy_TTV"]);

  assert.equal(result.matchedLogin, "cool_guy");
  assert.equal(result.lookupAttempted, true);
  assert.equal(result.isLive, true);
  assert.equal(result.reason, "exact cleaned login match; exact live stream lookup");
  assert.equal(result.confidence, 1);
  assert.equal(result.title, "ranked");
  assert.equal(result.gameName, "Rocket League");
  assert.equal(result.thumbnailUrl, "https://static-cdn.jtvnw.net/previews-ttv/live_user_cool_guy-{width}x{height}.jpg");
});

test("checkPlayers returns follower and live viewer counts for the matched channel", async () => {
  const followerLookups = [];
  const twitchClient = {
    async getLiveStreamByLogin(login) {
      return login === "cool_guy" ? {
        broadcasterLogin: "cool_guy",
        broadcasterId: "123",
        displayName: "Cool_Guy",
        isLive: true,
        viewerCount: 456,
        url: "https://www.twitch.tv/cool_guy",
      } : null;
    },
    async getUserByLogin() {
      return null;
    },
    async getFollowerCount(broadcasterId) {
      followerLookups.push(broadcasterId);
      return 12345;
    },
  };

  const [result] = await checkPlayers(twitchClient, ["Cool_Guy_TTV"]);

  assert.deepEqual(followerLookups, ["123"]);
  assert.equal(result.followerCount, 12345);
  assert.equal(result.viewerCount, 456);
});

test("checkPlayers keeps a matched offline channel when follower lookup fails", async () => {
  const twitchClient = {
    async getLiveStreamByLogin() {
      return null;
    },
    async getUserByLogin() {
      return {
        broadcasterLogin: "rattata",
        broadcasterId: "456",
        displayName: "Rattata",
        isLive: false,
      };
    },
    async getFollowerCount() {
      throw new Error("Twitch temporarily unavailable");
    },
  };

  const [result] = await checkPlayers(twitchClient, ["RATTATA-"]);

  assert.equal(result.matchedLogin, "rattata");
  assert.equal(result.followerCount, null);
  assert.equal(result.viewerCount, null);
});

test("checkPlayers rejects substring channel matches", async () => {
  const twitchClient = {
    async getLiveStreamByLogin() {
      return null;
    },
    async getUserByLogin(login) {
      if (login === "rattataurufufu") {
        return {
          broadcasterLogin: "rattataurufufu",
          displayName: "rattataurufufu",
          isLive: false,
          title: "",
          gameName: "",
          url: "https://www.twitch.tv/rattataurufufu",
        };
      }

      return null;
    },
    async searchChannels() {
      throw new Error("should not search channels");
    },
  };

  const [result] = await checkPlayers(twitchClient, ["RATTATA-TTV"]);

  assert.equal(result.matchedLogin, null);
  assert.equal(result.lookupAttempted, true);
  assert.equal(result.reason, "no exact twitch match");
  assert.equal(result.confidence, 0);
});

test("checkPlayers does not use twitch channel search results", async () => {
  const twitchClient = {
    async getLiveStreamByLogin() {
      return null;
    },
    async getUserByLogin() {
      return null;
    },
    async searchChannels() {
      throw new Error("should not search channels");
    },
  };

  const [result] = await checkPlayers(twitchClient, ["testplayerTTV"]);

  assert.equal(result.matchedLogin, null);
  assert.equal(result.confidence, 0);
});

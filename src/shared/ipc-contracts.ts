export type RocketLeagueSetupAvailability = {
  supported: boolean;
  installationCount: number;
};

export const Channels = Object.freeze({
  SETUP_STATUS: "setup:status",
  SETUP_COMPLETE: "setup:complete",
  TWITCH_START_AUTH: "twitch:start-auth",
  TWITCH_COMPLETE_AUTH: "twitch:complete-auth",
  TWITCH_VERIFY: "twitch:verify",
  PLAYERS_CHECK: "players:check",
  RL_SETUP: "rocket-league:setup",
  RL_SETUP_AVAILABILITY: "rocket-league:setup-availability",
  RL_CONNECT: "rocket-league:connect",
  RL_DISCONNECT: "rocket-league:disconnect",
  RL_STATUS: "rocket-league:status",
  RL_LOAD_PLAYERS: "rocket-league:load-players",
  RL_UPDATE: "rocket-league:update",
});

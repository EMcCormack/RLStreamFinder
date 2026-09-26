declare module "*.css";

declare global {
  interface Window {
    rocketLeagueViewer: {
      startTwitchAuth: () => Promise<any>;
      completeTwitchAuth: (flow: any) => Promise<any>;
      verifyTwitch: () => Promise<any>;
      checkPlayers: (playerNames: string[]) => Promise<any[]>;
      setupRocketLeague: () => Promise<{ message: string; configured: boolean; canceled?: boolean }>;
      connectRocketLeague: () => Promise<any>;
      disconnectRocketLeague: () => Promise<any>;
      getRocketLeagueStatus: () => Promise<any>;
      loadRocketLeaguePlayers: () => Promise<any>;
      onRocketLeagueUpdate: (callback: (state: any) => void) => () => void;
    };
  }
}

export {};

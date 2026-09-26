import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc-contracts";

contextBridge.exposeInMainWorld("rocketLeagueViewer", {
  startTwitchAuth() {
    return ipcRenderer.invoke(Channels.TWITCH_START_AUTH);
  },
  completeTwitchAuth(flow) {
    return ipcRenderer.invoke(Channels.TWITCH_COMPLETE_AUTH, flow);
  },
  verifyTwitch() {
    return ipcRenderer.invoke(Channels.TWITCH_VERIFY);
  },
  checkPlayers(playerNames) {
    return ipcRenderer.invoke(Channels.PLAYERS_CHECK, playerNames);
  },
  setupRocketLeague() {
    return ipcRenderer.invoke(Channels.RL_SETUP);
  },
  connectRocketLeague() {
    return ipcRenderer.invoke(Channels.RL_CONNECT);
  },
  disconnectRocketLeague() {
    return ipcRenderer.invoke(Channels.RL_DISCONNECT);
  },
  getRocketLeagueStatus() {
    return ipcRenderer.invoke(Channels.RL_STATUS);
  },
  loadRocketLeaguePlayers() {
    return ipcRenderer.invoke(Channels.RL_LOAD_PLAYERS);
  },
  onRocketLeagueUpdate(callback) {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(Channels.RL_UPDATE, listener);

    return () => {
      ipcRenderer.removeListener(Channels.RL_UPDATE, listener);
    };
  },
});

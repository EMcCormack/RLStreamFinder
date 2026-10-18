import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc-contracts";

contextBridge.exposeInMainWorld("rocketLeagueViewer", {
  getSetupCompleted() {
    return ipcRenderer.invoke(Channels.SETUP_STATUS);
  },
  completeSetup() {
    return ipcRenderer.invoke(Channels.SETUP_COMPLETE);
  },
  getWindowsStartupSettings() {
    return ipcRenderer.invoke(Channels.WINDOWS_STARTUP_GET);
  },
  setWindowsStartupEnabled(enabled: boolean) {
    return ipcRenderer.invoke(Channels.WINDOWS_STARTUP_SET, enabled);
  },
  getOverlaySettings() {
    return ipcRenderer.invoke(Channels.OVERLAY_SETTINGS_GET);
  },
  setOverlaySettings(shortcut: string, panelTransparency: number) {
    return ipcRenderer.invoke(Channels.OVERLAY_SETTINGS_SET, shortcut, panelTransparency);
  },
  hideWindow() {
    return ipcRenderer.invoke(Channels.WINDOW_HIDE);
  },
  toggleOverlay() {
    return ipcRenderer.invoke(Channels.WINDOW_TOGGLE_OVERLAY);
  },
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
  getRocketLeagueSetupAvailability() {
    return ipcRenderer.invoke(Channels.RL_SETUP_AVAILABILITY);
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

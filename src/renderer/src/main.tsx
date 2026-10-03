import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthNotice } from "./components/AuthNotice.tsx";
import { MatchPanel } from "./components/MatchPanel.tsx";
import { ConnectionSummary } from "./components/StatusSummary.tsx";
import { StreamersPanel } from "./components/StreamersPanel.tsx";
import { RocketLeagueHelp } from "./components/RocketLeagueHelp.tsx";
import { TwitchHelp } from "./components/TwitchHelp.tsx";
import { SetupSplash } from "./components/SetupSplash.tsx";
// No DEV mocks in production: do not import DEV_MOCK_SNAPSHOT
import { buildRosterKey, getScannablePlayerNames } from "./helpers/match.ts";
import "./styles.css";

let rendererDebugSequence = 0;

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
    players: (snapshot.players ?? [])
      .map((player) => player?.Name)
      .filter(Boolean),
    playerNames: snapshot.playerNames ?? [],
    teams: (snapshot.teams ?? []).map((team) => ({
      name: team?.Name,
      teamNum: team?.TeamNum,
      score: team?.Score,
    })),
  };
}

function summarizeState(state) {
  if (!state) {
    return null;
  }

  return {
    connected: state.connected ?? null,
    address: state.address ?? null,
    hasError: Boolean(state.error),
    error: state.error ?? null,
    snapshot: summarizeSnapshot(state.snapshot),
  };
}

function logRocketLeagueDebug(label, details = {}) {
  rendererDebugSequence += 1;
  console.info(`[RL_DEBUG renderer #${rendererDebugSequence}] ${label}`, JSON.stringify(details));
}

function App() {
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [rocketState, setRocketState] = useState(null);
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ message: "Ready.", isError: false });
  const [authFlow, setAuthFlow] = useState(null);
  const [showRocketHelp, setShowRocketHelp] = useState(false);
  const [showTwitchHelp, setShowTwitchHelp] = useState(false);
  const [connectingRocket, setConnectingRocket] = useState(false);
  const [connectingTwitch, setConnectingTwitch] = useState(false);
  // No mock roster state in production
  const lastRosterKeyRef = useRef("");
  const twitchConnectedRef = useRef(false);
  const scanInFlightRef = useRef(false);

  useEffect(() => {
    window.rocketLeagueViewer.getSetupCompleted()
      .then(setSetupCompleted)
      .catch(() => setSetupCompleted(false));
  }, []);

  const renderSnapshot = useCallback((nextSnapshot) => {
    logRocketLeagueDebug("render snapshot", {
      snapshot: summarizeSnapshot(nextSnapshot),
    });
    setSnapshot(nextSnapshot);
  }, []);

  const scanPlayers = useCallback(async (playersToScan, sourceLabel) => {
    const cleanPlayers = playersToScan.map((value) => value.trim()).filter(Boolean);
    if (!cleanPlayers.length) {
      setResults([]);
      setStatus({ message: "No players to scan.", isError: true });
      return;
    }

    scanInFlightRef.current = true;
    setStatus({
      message: `Checking ${cleanPlayers.length} ${sourceLabel} player${cleanPlayers.length === 1 ? "" : "s"}...`,
      isError: false,
    });

    try {
      const items = await window.rocketLeagueViewer.checkPlayers(cleanPlayers);
      setResults(items);
      const checkedCount = items.filter((item) => item.lookupAttempted).length;
      const matchedCount = items.filter((item) => item.matchedLogin).length;
      const liveCount = items.filter((item) => item.isLive).length;
      setStatus({
        message: `Checked ${checkedCount} player${checkedCount === 1 ? "" : "s"}. ${matchedCount} channel${matchedCount === 1 ? "" : "s"} found, ${liveCount} live.`,
        isError: false,
      });
    } catch (error) {
      setResults([]);
      setStatus({ message: error.message ?? "Unable to check Twitch right now.", isError: true });
    } finally {
      scanInFlightRef.current = false;
    }
  }, []);

  const maybeAutoScan = useCallback((nextSnapshot, isTwitchConnected = twitchConnected) => {
    const playersToScan = getScannablePlayerNames(nextSnapshot);
    const rosterKey = buildRosterKey(nextSnapshot);
    const canUseTwitch = isTwitchConnected || twitchConnectedRef.current;
    if (nextSnapshot?.isGameOver || !canUseTwitch || scanInFlightRef.current || !rosterKey || rosterKey === lastRosterKeyRef.current) {
      logRocketLeagueDebug("auto scan skipped", {
        isGameOver: Boolean(nextSnapshot?.isGameOver),
        canUseTwitch,
        scanInFlight: scanInFlightRef.current,
        hasRosterKey: Boolean(rosterKey),
        sameRosterKey: Boolean(rosterKey && rosterKey === lastRosterKeyRef.current),
        snapshot: summarizeSnapshot(nextSnapshot),
      });
      return;
    }

    lastRosterKeyRef.current = rosterKey;
    logRocketLeagueDebug("auto scan start", {
      players: playersToScan,
    });
    scanPlayers(playersToScan, "live match");
  }, [scanPlayers, twitchConnected]);

  useEffect(() => {
    twitchConnectedRef.current = twitchConnected;
  }, [twitchConnected]);

  const verifyTwitch = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setStatus({ message: "Verifying Twitch login...", isError: false });
    }

    try {
      await window.rocketLeagueViewer.verifyTwitch();
      setTwitchConnected(true);
      if (!quiet) {
        setStatus({ message: "Twitch verified.", isError: false });
      }
      return true;
    } catch (error) {
      setTwitchConnected(false);
      if (!quiet) {
        setStatus({ message: error.message ?? "Unable to verify Twitch login.", isError: true });
      }
      return false;
    }
  }, []);

  const connectRocketLeague = useCallback(async ({ quiet = false } = {}) => {
    setConnectingRocket(true);
    if (!quiet) {
      setStatus({ message: "Connecting to Rocket League...", isError: false });
    }

    try {
      const state = await window.rocketLeagueViewer.connectRocketLeague();
      logRocketLeagueDebug("connect RL return", {
        state: summarizeState(state),
      });
      setRocketState(state);
      renderSnapshot(state.snapshot);
      if (!state?.connected) {
        setStatus({
          message: "Rocket League is not connected. Use the ? icon for setup and troubleshooting.",
          isError: false,
        });
        return;
      }

      maybeAutoScan(state.snapshot);
      setStatus({
        message: state.snapshot?.playerNames?.length
          ? `Loaded ${state.snapshot.playerNames.length} live players.`
          : "Rocket League connected. Waiting for a live roster.",
        isError: false,
      });
    } catch (error) {
      setRocketState(null);
      // Do not use dev/mock rosters in production. Report the connection failure.
      setResults([]);
      renderSnapshot(null);
      setStatus({ message: error.message ?? "Unable to connect to Rocket League.", isError: true });
    } finally {
      setConnectingRocket(false);
    }
  }, [maybeAutoScan, renderSnapshot]);

  const connectTwitch = useCallback(async () => {
    setConnectingTwitch(true);
    setStatus({ message: "Starting Twitch sign-in...", isError: false });

    try {
      const flow = await window.rocketLeagueViewer.startTwitchAuth();
      setAuthFlow(flow);
      setStatus({ message: "Waiting for Twitch authorization...", isError: false });
      await window.rocketLeagueViewer.completeTwitchAuth(flow);
      setAuthFlow(null);
      setTwitchConnected(true);
      setStatus({ message: "Twitch connected.", isError: false });
      maybeAutoScan(snapshot, true);
    } catch (error) {
      setAuthFlow(null);
      setTwitchConnected(false);
      setStatus({ message: error.message ?? "Unable to connect Twitch.", isError: true });
    } finally {
      setConnectingTwitch(false);
    }
  }, [maybeAutoScan, snapshot]);

  useEffect(() => {
    let unsubscribe = () => {};

    verifyTwitch({ quiet: true }).then((isConnected) => {
      window.rocketLeagueViewer.getRocketLeagueStatus()
        .then((state) => {
          logRocketLeagueDebug("initial RL status return", {
            state: summarizeState(state),
          });
          setRocketState(state);
          renderSnapshot(state.snapshot);
          if (state.snapshot?.playerNames?.length) {
            maybeAutoScan(state.snapshot, isConnected);
          } else {
            connectRocketLeague({ quiet: true });
          }
        })
        .catch(() => {
          setRocketState(null);
        });
    });

    unsubscribe = window.rocketLeagueViewer.onRocketLeagueUpdate((state) => {
      logRocketLeagueDebug("ipc RL update received", {
        state: summarizeState(state),
      });
      setRocketState(state);
      if (state?.error) {
        setStatus({ message: state.error, isError: true });
        return;
      }

      
      renderSnapshot(state?.snapshot ?? null);
      if (state?.snapshot?.playerNames?.length) {
        setStatus({
          message: `Live roster updated with ${state.snapshot.playerNames.length} players.`,
          isError: false,
        });
        maybeAutoScan(state.snapshot);
      } else if (state?.connected) {
        setStatus({ message: "Rocket League connected. Waiting for a live roster.", isError: false });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (setupCompleted === null) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400" role="status">Loading RLStreamFinder…</main>;
  }

  if (!setupCompleted) {
    return (
      <main className="mx-auto w-full p-4 text-slate-50">
        <AuthNotice authFlow={authFlow} />
        <SetupSplash
          twitchConnected={twitchConnected}
          connectingTwitch={connectingTwitch}
          status={status}
          onConnectTwitch={connectTwitch}
          onRocketHelp={() => setShowRocketHelp(true)}
          onTwitchHelp={() => setShowTwitchHelp(true)}
          onComplete={async () => {
            await window.rocketLeagueViewer.completeSetup();
            setSetupCompleted(true);
          }}
        />
        {showRocketHelp ? <RocketLeagueHelp onClose={() => setShowRocketHelp(false)} /> : null}
        {showTwitchHelp ? <TwitchHelp onClose={() => setShowTwitchHelp(false)} /> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] p-4 text-slate-50">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 pb-4 pt-3">
        <div>
          <p className="mb-1 text-xs font-black uppercase text-teal-300">RLStreamFinder</p>
          <h1 className="text-3xl font-black tracking-normal">Live Match Scanner</h1>
        </div>
      <ConnectionSummary
        rocketState={rocketState}
        twitchConnected={twitchConnected}
        connectingRocket={connectingRocket}
        connectingTwitch={connectingTwitch}
        onConnectRocket={() => connectRocketLeague()}
        onConnectTwitch={connectTwitch}
        onRocketHelp={() => setShowRocketHelp(true)}
        onTwitchHelp={() => setShowTwitchHelp(true)}
      />
      </header>

      <AuthNotice authFlow={authFlow} />

      <section className="grid grid-cols-[minmax(0,1fr)_460px] items-start gap-3 max-lg:grid-cols-1">
        <MatchPanel
          results={results}
          snapshot={snapshot}
        />
        <StreamersPanel
          results={results}
          snapshot={snapshot}
          status={status}
        />
      </section>
      {showRocketHelp ? <RocketLeagueHelp onClose={() => setShowRocketHelp(false)} /> : null}
      {showTwitchHelp ? <TwitchHelp onClose={() => setShowTwitchHelp(false)} /> : null}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

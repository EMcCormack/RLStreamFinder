import { ActionButton, StatusDot } from "./ui.tsx";

export function ConnectionSummary({
  rocketState,
  twitchConnected,
  connectingRocket,
  connectingTwitch,
  onConnectRocket,
  onConnectTwitch,
  onRocketHelp,
  onTwitchHelp,
}) {
  const rocketConnected = Boolean(rocketState?.connected);
  return (
    <section aria-label="Connections" className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
      <div className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/92 px-3 py-2">
        <StatusDot state={rocketConnected ? "online" : "offline"} />
        <div>
          <p className="text-xs font-black text-slate-200">Rocket League</p>
          <p className="text-xs text-slate-400">{rocketConnected ? "Connected" : "Disconnected"}</p>
        </div>
        {!rocketConnected ? <>
          <ActionButton size="small" variant="secondary" disabled={connectingRocket} onClick={onConnectRocket}>
            {connectingRocket ? "Connecting…" : "Connect RL"}
          </ActionButton>
          <button type="button" aria-label="Rocket League setup and troubleshooting" title="Setup and troubleshooting" onClick={onRocketHelp} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-xs font-bold text-slate-300 hover:border-teal-300 hover:text-teal-300">?</button>
        </> : null}
      </div>
      <div className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/92 px-3 py-2">
        <StatusDot state={twitchConnected ? "online" : "offline"} />
        <div>
          <p className="text-xs font-black text-slate-200">Twitch</p>
          <p className="text-xs text-slate-400">{twitchConnected ? "Signed in" : "Not signed in"}</p>
        </div>
        {!twitchConnected ? <ActionButton size="small" variant="secondary" disabled={connectingTwitch} onClick={onConnectTwitch}>
          {connectingTwitch ? "Connecting…" : "Connect Twitch"}
        </ActionButton> : null}
        <button type="button" aria-label="Why connect Twitch?" title="Why connect Twitch?" onClick={onTwitchHelp} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-xs font-bold text-slate-300 hover:border-teal-300 hover:text-teal-300">?</button>
      </div>
    </section>
  );
}

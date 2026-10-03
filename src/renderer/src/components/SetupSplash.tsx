import { useEffect, useState } from "react";
import { Gamepad2, Radio, Check } from "lucide-react";
import { ActionButton } from "./ui.tsx";
import type { RocketLeagueSetupAvailability } from "../../../shared/ipc-contracts";

type SetupSplashProps = {
  twitchConnected: boolean;
  connectingTwitch: boolean;
  status: { message: string; isError: boolean };
  onConnectTwitch: () => void;
  onRocketHelp: () => void;
  onTwitchHelp: () => void;
  onComplete: () => Promise<void>;
};

export function SetupSplash({ twitchConnected, connectingTwitch, status, onConnectTwitch, onRocketHelp, onTwitchHelp, onComplete }: SetupSplashProps) {
  const [settingUp, setSettingUp] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [availability, setAvailability] = useState<RocketLeagueSetupAvailability | null>(null);
  const [checkingInstallation, setCheckingInstallation] = useState(true);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [result, setResult] = useState<{ message: string; isError: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const busy = settingUp || connectingTwitch || saving;

  useEffect(() => {
    let active = true;
    window.rocketLeagueViewer.getRocketLeagueSetupAvailability()
      .then((response) => { if (active) setAvailability(response); })
      .catch(() => { if (active) setDetectionFailed(true); })
      .finally(() => { if (active) setCheckingInstallation(false); });
    return () => { active = false; };
  }, []);

  const detectionMessage = checkingInstallation ? "Looking for Rocket League…"
    : detectionFailed ? "Couldn’t check for Rocket League. You can still try setup or follow the manual instructions."
    : !availability?.supported ? "Automatic setup supports Windows and Linux Wine/Proton installations. Follow the manual instructions on the computer running Rocket League."
    : availability.installationCount > 0 ? `Found ${availability.installationCount === 1 ? "Rocket League" : `${availability.installationCount} Rocket League installations`}. Automatic setup is available. Close the game before continuing.`
    : "Rocket League wasn’t found in the usual folders. Choose its installation folder to continue setup.";

  const setupLabel = settingUp ? "Setting up…" : configured ? "Rocket League configured"
    : checkingInstallation ? "Looking for Rocket League…"
    : availability?.supported && availability.installationCount === 0 ? "Choose installation folder"
    : detectionFailed ? "Try automatic setup" : "Set up automatically";

  async function setupRocketLeague() {
    setSettingUp(true);
    setResult(null);
    try {
      const response = await window.rocketLeagueViewer.setupRocketLeague();
      setResult({ message: response.message, isError: !response.configured && !response.canceled });
      if (response.configured) setConfigured(true);
    } catch (error) {
      setResult({ message: error.message ?? "Unable to configure Rocket League. Try the manual setup instructions.", isError: true });
    } finally {
      setSettingUp(false);
    }
  }

  async function finish() {
    setSaving(true);
    setSaveError("");
    try {
      await onComplete();
    } catch (error) {
      setSaveError("Unable to save setup. Please try again.");
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="setup-title" className="mx-auto flex min-h-[calc(100vh-32px)] max-w-3xl flex-col justify-center py-8">
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-teal-300">RLStreamFinder · First-time setup</p>
      <h1 id="setup-title" className="text-4xl font-black tracking-tight">Find the streamers in your match.</h1>
      <p className="mb-8 mt-3 max-w-xl text-base text-slate-400">Welcome! Set up Rocket League and connect Twitch to see who’s live while you play.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <Gamepad2 className="mb-5 text-teal-300" size={28} aria-hidden="true" />
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">Step 1</p>
          <h2 className="text-xl font-bold">Set up Rocket League</h2>
          <p className="mb-5 mt-2 text-sm leading-relaxed text-slate-300">Close Rocket League first. We’ll find its installation or ask you to choose its folder, then enable the Stats API to read your live match roster. Your configuration is backed up before editing.</p>
          {!configured ? <p role="status" className="mb-4 text-sm text-slate-300">{detectionMessage}</p> : null}
          {availability?.supported !== false ? <ActionButton onClick={setupRocketLeague} disabled={busy || configured || checkingInstallation}>{setupLabel}</ActionButton> : null}
          {configured ? <p className="mt-3 flex items-center gap-2 text-sm text-teal-300"><Check size={16} aria-hidden="true" />Configuration saved</p> : null}
          {result ? <p role="status" className={`mt-3 text-sm ${result.isError ? "text-rose-300" : "text-slate-300"}`}>{result.message}</p> : null}
          <button type="button" onClick={onRocketHelp} className="mt-4 block text-sm text-sky-300 hover:underline">Manual setup and troubleshooting</button>
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <Radio className="mb-5 text-teal-300" size={28} aria-hidden="true" />
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">Step 2</p>
          <h2 className="text-xl font-bold">Connect Twitch</h2>
          <p className="mb-5 mt-2 text-sm leading-relaxed text-slate-300">Sign in through Twitch to look up players’ channels and check who’s live. Your sign-in is saved on this computer.</p>
          <ActionButton onClick={onConnectTwitch} disabled={busy || twitchConnected}>{connectingTwitch ? "Connecting Twitch…" : twitchConnected ? "Twitch connected" : "Connect Twitch"}</ActionButton>
          {twitchConnected ? <p className="mt-3 flex items-center gap-2 text-sm text-teal-300"><Check size={16} aria-hidden="true" />Signed in</p> : null}
          <button type="button" onClick={onTwitchHelp} className="mt-4 block text-sm text-sky-300 hover:underline">Why connect Twitch?</button>
        </section>
      </div>
      {status.message !== "Ready." ? <p role="status" className={`mt-4 text-sm ${status.isError ? "text-rose-300" : "text-slate-400"}`}>{status.message}</p> : null}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ActionButton onClick={finish} disabled={busy}>{saving ? "Saving…" : "Open match scanner"}</ActionButton>
        <p className="max-w-sm text-sm text-slate-400">You can finish setup later using the connection controls in the scanner.</p>
      </div>
      {saveError ? <p role="alert" className="mt-3 text-sm text-rose-300">{saveError}</p> : null}
    </section>
  );
}

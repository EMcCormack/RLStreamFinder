import { useEffect, useRef, useState } from "react";
import { ActionButton } from "./ui.tsx";

export function RocketLeagueHelp({ onClose }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [result, setResult] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function setup() {
    setSettingUp(true);
    setResult(null);
    try {
      const response = await window.rocketLeagueViewer.setupRocketLeague();
      if (!response.canceled) {
        setResult({ message: response.message, isError: !response.configured });
      }
    } catch (error) {
      setResult({ message: error.message ?? "Unable to configure the Stats API.", isError: true });
    } finally {
      setSettingUp(false);
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="rocket-help-title" onCancel={onClose} className="m-auto max-h-[90vh] w-[min(560px,calc(100%_-_32px))] overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id="rocket-help-title" className="text-xl font-black">Rocket League setup and troubleshooting</h2>
        <ActionButton size="small" variant="ghost" onClick={onClose} aria-label="Close troubleshooting">Close</ActionButton>
      </div>
      <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-slate-300">
        <li>Verify Rocket League is running on this computer.</li>
        <li>Enable the Stats API using the setup option below. Close the game before changing its configuration.</li>
        <li>Launch or restart Rocket League, then join a live match. The Stats API sends roster data during live matches.</li>
        <li>Close this window and select Connect RL to try again.</li>
      </ol>
      <section className="mb-5 rounded-lg border border-teal-400/30 bg-teal-400/5 p-4">
        <h3 className="mb-2 font-bold">Automatic setup</h3>
        <p className="mb-3 text-sm text-slate-300">We’ll check the usual installation folders first. If Rocket League is elsewhere, choose its folder. The configuration will be backed up before editing.</p>
        <ActionButton size="small" disabled={settingUp} onClick={setup}>{settingUp ? "Setting up…" : "Set up automatically"}</ActionButton>
        {result ? <p role="status" className={`mt-3 text-sm ${result.isError ? "text-rose-300" : "text-teal-300"}`}>{result.message}</p> : null}
      </section>
      <details className="text-sm text-slate-300">
        <summary className="cursor-pointer font-bold text-slate-100">Manual setup instructions</summary>
        <p className="mb-3 mt-3">With Rocket League closed, open <code>TAGame/Config/TAStatsAPI.ini</code> in the game’s installation folder. If that file is absent, use <code>DefaultStatsAPI.ini</code> in the same folder. Add or update this section, then save:</p>
        <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-teal-200">{"[TAGame.MatchStatsExporter_TA]\nPort=49123\nPacketSendRate=10"}</pre>
        <p className="mt-3">Restart the game after saving, join a live match, and reconnect.</p>
        <a className="mt-3 inline-block text-sky-300 hover:underline" href="https://www.rocketleague.com/developer/stats-api" target="_blank" rel="noreferrer">Official Stats API instructions</a>
      </details>
    </dialog>
  );
}

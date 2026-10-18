import { useEffect, useRef, useState } from "react";
import type { OverlaySettings } from "../../../shared/overlay-settings";
import { ActionButton } from "./ui.tsx";
import { WindowsStartupSetting } from "./WindowsStartupSetting.tsx";
import { WindowsOverlayNotice } from "./WindowsOverlayNotice.tsx";

type SettingsDialogProps = {
  settings: OverlaySettings | null;
  onSaved: (settings: OverlaySettings) => void;
  onClose: () => void;
};

export function SettingsDialog({ settings, onSaved, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shortcut, setShortcut] = useState(settings?.shortcut ?? "");
  const [transparency, setTransparency] = useState(settings?.panelTransparency ?? 8);
  const [saving, setSaving] = useState(false);
  const [savingStartup, setSavingStartup] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  useEffect(() => {
    if (!settings) return;
    setShortcut(settings.shortcut);
    setTransparency(settings.panelTransparency);
  }, [settings]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const updated = await window.rocketLeagueViewer.setOverlaySettings(shortcut, transparency);
      onSaved(updated);
      onClose();
    } catch (error) {
      setError(error.message ?? "Unable to save settings. Please try again.");
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="settings-title" onCancel={onClose} className="m-auto max-h-[90vh] w-[min(520px,calc(100%_-_32px))] overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h2 id="settings-title" className="text-xl font-black">Settings</h2>
        <ActionButton size="small" variant="ghost" onClick={onClose} aria-label="Close settings">Close</ActionButton>
      </div>
      {settings ? <div className="space-y-6">
        <div>
          <label htmlFor="overlay-shortcut" className="block text-sm font-semibold">Overlay shortcut</label>
          <input id="overlay-shortcut" value={shortcut} onChange={(event) => setShortcut(event.target.value)} spellCheck={false} className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-50" />
          <p className="mt-2 text-xs text-slate-400">Use modifiers and a letter, number, or F1–F12. Example: Control+Alt+R.</p>
          {!settings.shortcutActive ? <p role="status" className="mt-2 text-sm text-amber-300">The saved shortcut could not be registered. Choose another combination.</p> : null}
          <WindowsOverlayNotice />
        </div>
        <div>
          <label htmlFor="panel-transparency" className="flex justify-between text-sm font-semibold"><span>Panel transparency</span><span>{transparency}%</span></label>
          <input id="panel-transparency" type="range" min="0" max="60" step="1" value={transparency} onChange={(event) => setTransparency(Number(event.target.value))} className="mt-3 w-full accent-teal-400" />
          <p className="mt-1 text-xs text-slate-400">Makes panel backgrounds see-through while keeping text clear.</p>
        </div>
        <div className="border-t border-slate-700 pt-5">
          <h3 className="mb-3 text-sm font-semibold">Launch with Rocket League</h3>
          <WindowsStartupSetting onBusyChange={setSavingStartup} />
        </div>
        {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
        <ActionButton onClick={save} disabled={saving || savingStartup}>{saving ? "Saving…" : "Save settings"}</ActionButton>
      </div> : <p role="status" className="text-sm text-slate-400">Loading settings…</p>}
    </dialog>
  );
}

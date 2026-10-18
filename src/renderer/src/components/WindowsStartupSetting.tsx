import { useEffect, useState } from "react";
import type { WindowsStartupSettings } from "../../../shared/ipc-contracts";

type WindowsStartupSettingProps = {
  onBusyChange?: (busy: boolean) => void;
};

export function WindowsStartupSetting({ onBusyChange }: WindowsStartupSettingProps) {
  const [settings, setSettings] = useState<WindowsStartupSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    window.rocketLeagueViewer.getWindowsStartupSettings()
      .then((value) => { if (active) setSettings(value); })
      .catch(() => { if (active) setError("Unable to load the Windows startup setting."); });
    return () => { active = false; };
  }, []);

  async function update(enabled: boolean) {
    const previous = settings;
    setSettings({ ...settings, enabled });
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    try {
      setSettings(await window.rocketLeagueViewer.setWindowsStartupEnabled(enabled));
    } catch {
      setSettings(previous);
      setError("Unable to save the Windows startup setting. Please try again.");
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  if (!settings) return error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null;
  if (!settings.supported) return <p className="text-sm text-slate-400">Available in the packaged Windows app.</p>;

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-teal-400"
          checked={settings.enabled}
          disabled={saving}
          onChange={(event) => void update(event.target.checked)}
        />
        <span>
          <span className="font-semibold">Launch with Rocket League</span>
          <span className="mt-1 block text-slate-400">Start a small watcher when you sign in to Windows. It opens RLStreamFinder when Rocket League starts. Off by default.</span>
        </span>
      </label>
      {error ? <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}

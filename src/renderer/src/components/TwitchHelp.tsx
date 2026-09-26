import { useEffect, useRef } from "react";
import { ActionButton } from "./ui.tsx";

export function TwitchHelp({ onClose }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="twitch-help-title" onCancel={onClose} className="m-auto max-h-[90vh] w-[min(560px,calc(100%_-_32px))] overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id="twitch-help-title" className="text-xl font-black">Why connect Twitch?</h2>
        <ActionButton size="small" variant="ghost" onClick={onClose} aria-label="Close Twitch help">Close</ActionButton>
      </div>
      <div className="space-y-3 text-sm text-slate-300">
        <p>Signing in to Twitch lets this app look up players’ Twitch channels and check whether they are live.</p>
        <p>When you select Connect Twitch, Twitch opens in your browser and asks you to enter a code. You sign in on Twitch’s site; this app never asks for your password or extra Twitch permissions.</p>
        <p>Your sign-in is saved on this computer, so you can stay signed in between launches. When checking players, the app sends possible Twitch names to Twitch for channel and live-status lookups.</p>
      </div>
    </dialog>
  );
}

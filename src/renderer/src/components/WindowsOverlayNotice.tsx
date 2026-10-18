export function WindowsOverlayNotice() {
  if (!/Windows/.test(navigator.userAgent)) return null;

  return (
    <p className="mt-2 text-xs text-slate-400">On Windows, set Rocket League's Window Mode to Borderless. Fullscreen may minimize the game when opening the overlay.</p>
  );
}

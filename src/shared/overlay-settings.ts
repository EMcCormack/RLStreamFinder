export const DEFAULT_OVERLAY_SHORTCUT = "CommandOrControl+Alt+R";
export const DEFAULT_PANEL_TRANSPARENCY = 8;

export type OverlaySettings = {
  shortcut: string;
  shortcutActive: boolean;
  panelTransparency: number;
};

export function normalizeOverlayShortcut(value: string): string {
  if (typeof value !== "string") throw new TypeError("Enter a keyboard shortcut.");
  const parts = value.split("+").map((part) => part.trim());
  if (parts.length < 2 || parts.some((part) => !part)) {
    throw new Error("Use a shortcut such as Control+Alt+R.");
  }

  const key = parts.pop().toUpperCase();
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key)) {
    throw new Error("Use a letter, number, or F1–F12 as the shortcut key.");
  }

  const aliases = new Map([
    ["ctrl", "Control"], ["control", "Control"],
    ["cmdorctrl", "CommandOrControl"], ["commandorcontrol", "CommandOrControl"],
    ["alt", "Alt"], ["option", "Alt"],
    ["shift", "Shift"],
    ["cmd", "Meta"], ["command", "Meta"], ["meta", "Meta"], ["super", "Meta"],
  ]);
  const modifiers = parts.map((part) => aliases.get(part.toLowerCase()));
  if (modifiers.some((modifier) => !modifier) || new Set(modifiers).size !== modifiers.length ||
      (modifiers.includes("Control") && modifiers.includes("CommandOrControl"))) {
    throw new Error("Use each modifier once, such as Control+Alt+R.");
  }
  if (!modifiers.some((modifier) => ["Control", "CommandOrControl", "Alt", "Meta"].includes(modifier))) {
    throw new Error("Include Control, Alt, or Command in the shortcut.");
  }

  const order = ["CommandOrControl", "Control", "Alt", "Shift", "Meta"];
  return [...modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b)), key].join("+");
}

export function validatePanelTransparency(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 60) {
    throw new RangeError("Transparency must be between 0% and 60%.");
  }
  return value;
}

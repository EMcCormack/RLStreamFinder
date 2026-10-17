import { expect, test } from "vitest";
import { equivalentOverlayShortcuts, normalizeOverlayShortcut, validatePanelTransparency } from "../src/shared/overlay-settings";

test("accepts configurable global shortcuts and normalizes modifier names", () => {
  expect(normalizeOverlayShortcut("ctrl + alt + r")).toBe("Control+Alt+R");
  expect(normalizeOverlayShortcut("Shift+CommandOrControl+F12")).toBe("CommandOrControl+Shift+F12");
});

test("rejects shortcuts that cannot be safely registered", () => {
  for (const shortcut of ["R", "Shift+R", "Control+", "Control+Space", "Control+Control+R", "Control+CommandOrControl+R"]) {
    expect(() => normalizeOverlayShortcut(shortcut)).toThrow();
  }
});

test("limits panel transparency to the readable range", () => {
  expect(validatePanelTransparency(0)).toBe(0);
  expect(validatePanelTransparency(60)).toBe(60);
  for (const value of [-1, 61, 5.5, Number.NaN]) expect(() => validatePanelTransparency(value)).toThrow();
});

test("treats Control and CommandOrControl as the same binding outside macOS", () => {
  expect(equivalentOverlayShortcuts("CommandOrControl+Alt+R", "Control+Alt+R", false)).toBe(true);
  expect(equivalentOverlayShortcuts("CommandOrControl+Alt+R", "Control+Alt+R", true)).toBe(false);
});

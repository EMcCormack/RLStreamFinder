import { expect, test } from "vitest";
import { normalizeOverlayShortcut, validatePanelTransparency } from "../src/shared/overlay-settings";

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

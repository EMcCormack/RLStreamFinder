import { test, expect } from "vitest";
import { portalShortcutId, portalTrigger } from "../src/main/services/kde-shortcut-portal";

test("uses a stable KDE action ID for the same shortcut", () => {
  expect(portalShortcutId("Control+Alt+R")).toBe("toggle_overlay_control_alt_r");
  expect(portalShortcutId("Control+Alt+Y")).toBe("toggle_overlay_control_alt_y");
});

test("converts an Electron shortcut to the XDG trigger format", () => {
  expect(portalTrigger("CommandOrControl+Alt+R")).toBe("CTRL+ALT+r");
  expect(portalTrigger("Control+Shift+F12")).toBe("CTRL+SHIFT+F12");
});

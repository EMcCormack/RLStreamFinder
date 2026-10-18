import { test, expect } from "vitest";
import { nodeSocketBusAddress, portalShortcutId, portalTrigger } from "../src/main/services/kde-shortcut-portal";

test("uses a stable KDE action ID for the same shortcut", () => {
  expect(portalShortcutId("Control+Alt+R")).toBe("toggle_overlay_control_alt_r");
  expect(portalShortcutId("Control+Alt+Y")).toBe("toggle_overlay_control_alt_y");
});

test("converts an Electron shortcut to the XDG trigger format", () => {
  expect(portalTrigger("CommandOrControl+Alt+R")).toBe("CTRL+ALT+r");
  expect(portalTrigger("Control+Shift+F12")).toBe("CTRL+SHIFT+F12");
});

test("uses Node's Unix socket transport for KDE's session bus address", () => {
  expect(nodeSocketBusAddress("unix:path=/run/user/1000/bus,guid=abc"))
    .toBe("unix:socket=/run/user/1000/bus,guid=abc");
  expect(nodeSocketBusAddress("tcp:host=localhost,port=123;unix:path=/tmp/bus"))
    .toBe("tcp:host=localhost,port=123;unix:socket=/tmp/bus");
  expect(nodeSocketBusAddress(undefined)).toBeUndefined();
});

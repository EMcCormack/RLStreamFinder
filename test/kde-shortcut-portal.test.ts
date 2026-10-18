import { test, expect } from "vitest";
import { nodeSocketBusAddress, PORTAL_SHORTCUT_ID, portalTrigger } from "../src/main/services/kde-shortcut-portal";

test("uses one KDE action ID for the overlay regardless of its trigger", () => {
  expect(PORTAL_SHORTCUT_ID).toBe("toggle_overlay");
  expect(portalTrigger("Control+Alt+R")).toBe("CTRL+ALT+r");
  expect(portalTrigger("Control+Alt+Y")).toBe("CTRL+ALT+y");
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

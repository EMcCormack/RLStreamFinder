import dbus, { type MessageBus, type ClientInterface, type Message } from "dbus-next";

const PORTAL_NAME = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";
const GLOBAL_SHORTCUTS = "org.freedesktop.portal.GlobalShortcuts";
const REQUEST = "org.freedesktop.portal.Request";

export function isKdeWayland(environment: NodeJS.ProcessEnv = process.env): boolean {
  return process.platform === "linux" && environment.XDG_SESSION_TYPE === "wayland" &&
    (environment.XDG_CURRENT_DESKTOP ?? "").split(":").some((desktop) => desktop.toLowerCase() === "kde");
}

export function portalShortcutId(shortcut: string): string {
  return `toggle_overlay_${shortcut.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export function portalTrigger(shortcut: string): string {
  const parts = shortcut.split("+");
  const key = parts.pop()!;
  const modifiers = parts.map((part) => part === "CommandOrControl" || part === "Control" ? "CTRL" : part === "Meta" ? "LOGO" : part.toUpperCase());
  return [...modifiers, key.length === 1 ? key.toLowerCase() : key].join("+");
}

export class KdeShortcutPortal {
  private bus: MessageBus | null = null;
  private portal: ClientInterface | null = null;
  private sessionHandle: string | null = null;
  private shortcutId: string | null = null;
  private responses = new Map<string, [number, Record<string, dbus.Variant>]>();
  private waiters = new Map<string, (response: [number, Record<string, dbus.Variant>]) => void>();
  private counter = 0;

  constructor(private readonly onActivated: () => void) {}

  private onMessage = (message: Message): void => {
    if (message.interface !== REQUEST || message.member !== "Response" || !message.path) return;
    const response = message.body as [number, Record<string, dbus.Variant>];
    const waiter = this.waiters.get(message.path);
    if (waiter) {
      this.waiters.delete(message.path);
      waiter(response);
    } else {
      this.responses.set(message.path, response);
    }
  };

  private onPortalActivated = (sessionHandle: string, shortcutId: string): void => {
    if (sessionHandle === this.sessionHandle && shortcutId === this.shortcutId) this.onActivated();
  };

  private async waitForResponse(handle: string): Promise<Record<string, dbus.Variant>> {
    const cached = this.responses.get(handle);
    if (cached) this.responses.delete(handle);
    const [status, results] = cached ?? await new Promise<[number, Record<string, dbus.Variant>]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(handle);
        reject(new Error("KDE did not answer the shortcut request."));
      }, 60000);
      this.waiters.set(handle, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
    if (status !== 0) throw new Error(`KDE declined the shortcut request (${status}).`);
    return results;
  }

  private async connect(): Promise<void> {
    if (this.bus) return;
    const bus = dbus.sessionBus();
    bus.on("error", (error) => console.warn("KDE shortcut portal D-Bus error:", error));
    bus.on("message", this.onMessage);
    this.bus = bus;
    try {
      await bus.call(new dbus.Message({
        path: "/org/freedesktop/DBus",
        destination: "org.freedesktop.DBus",
        interface: "org.freedesktop.DBus",
        member: "AddMatch",
        signature: "s",
        body: ["type='signal',interface='org.freedesktop.portal.Request',member='Response'"],
      }));
      const object = await bus.getProxyObject(PORTAL_NAME, PORTAL_PATH);
      this.portal = object.getInterface(GLOBAL_SHORTCUTS);
      this.portal.on("Activated", this.onPortalActivated);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async bind(shortcut: string): Promise<boolean> {
    await this.connect();
    await this.closeSession();
    const id = portalShortcutId(shortcut);
    const token = `rlsf_${process.pid}_${++this.counter}`;
    const sessionRequest = await this.portal!.CreateSession({
      handle_token: new dbus.Variant("s", `${token}_create`),
      session_handle_token: new dbus.Variant("s", `${token}_session`),
    });
    const sessionResult = await this.waitForResponse(sessionRequest);
    const sessionHandle = sessionResult.session_handle?.value;
    if (typeof sessionHandle !== "string") throw new Error("KDE returned no shortcut session.");
    this.sessionHandle = sessionHandle;
    this.shortcutId = id;
    try {
      const bindRequest = await this.portal!.BindShortcuts(sessionHandle, [[id, {
        description: new dbus.Variant("s", "Toggle RLStreamFinder overlay"),
        preferred_trigger: new dbus.Variant("s", portalTrigger(shortcut)),
      }]], "", { handle_token: new dbus.Variant("s", `${token}_bind`) });
      const bindResult = await this.waitForResponse(bindRequest);
      const shortcuts = bindResult.shortcuts?.value as Array<[string, Record<string, dbus.Variant>]> | undefined;
      return Boolean(shortcuts?.some(([boundId]) => boundId === id));
    } catch (error) {
      await this.closeSession();
      throw error;
    }
  }

  private async closeSession(): Promise<void> {
    const handle = this.sessionHandle;
    this.sessionHandle = null;
    this.shortcutId = null;
    if (!handle || !this.bus) return;
    await this.bus.call(new dbus.Message({
      path: handle,
      destination: PORTAL_NAME,
      interface: "org.freedesktop.portal.Session",
      member: "Close",
    })).catch(() => {});
  }

  stop(): void {
    void this.closeSession();
    this.portal?.off("Activated", this.onPortalActivated);
    this.portal = null;
    this.bus?.off("message", this.onMessage);
    this.bus?.disconnect();
    this.bus = null;
  }
}

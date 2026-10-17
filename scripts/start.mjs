import { spawn } from "node:child_process";
import path from "node:path";

const forgePath = path.resolve(import.meta.dirname, "../node_modules/@electron-forge/cli/dist/electron-forge.js");
const kdeWayland = process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland" &&
  (process.env.XDG_CURRENT_DESKTOP ?? "").split(":").some((desktop) => desktop.toLowerCase() === "kde");
const forwardedArgs = process.argv.slice(2);
const args = [forgePath, "start", ...(kdeWayland || forwardedArgs.length
  ? ["--", ...(kdeWayland ? ["--ozone-platform=x11"] : []), ...forwardedArgs]
  : [])];
const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });

child.on("error", (error) => {
  console.error("Could not start Electron Forge:", error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

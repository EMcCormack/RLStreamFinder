import type { ForgeConfig, ForgeConfigMaker } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const buildProfile = process.env.BUILD_PROFILE;
const makers: ForgeConfigMaker[] = [
  new MakerZIP({}, ["darwin", "linux"]),
];

if (process.platform === "win32" || buildProfile === "windows") {
  makers.push(new MakerSquirrel({
    setupIcon: "./assets/icon.ico",
  }));
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "rl-stream-finder",
    icon: "./assets/icon",
    extraResource: ["./assets/icon.png"],
  },
  rebuildConfig: {},
  makers,
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "main.vite.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/index.ts",
          config: "preload.vite.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.config.ts",
        },
      ],
    }),
  ],
};

export default config;

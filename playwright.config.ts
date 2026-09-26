import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  testIgnore: "demo-screenshot.spec.ts",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
  },
});

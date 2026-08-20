import { defineConfig } from "@playwright/test";

const smokePort = 4174;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  outputDir: "node_modules/.cache/stripes-browser-smoke",
  use: {
    baseURL: smokeBaseUrl,
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
});

import { defineConfig } from "@playwright/test";

const smokePort = 4174;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "./tests/browser",
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
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --config vite.config.ts --host 127.0.0.1 --port ${smokePort} --strictPort`,
    url: smokeBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_API_KEY: "AIzaSyBrowserSmokeOnly0000000000000000000",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-stripes-browser-smoke.localhost",
      VITE_FIREBASE_PROJECT_ID: "demo-stripes-browser-smoke",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-stripes-browser-smoke.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
      VITE_FIREBASE_APP_ID: "1:000000000000:web:browser-smoke-only",
      VITE_FIREBASE_FUNCTIONS_REGION: "europe-west1",
      VITE_FIREBASE_VAPID_KEY: "",
      VITE_GOOGLE_CLIENT_ID: "",
      VITE_GOOGLE_API_KEY: "",
      VITE_GOOGLE_APP_ID: "",
      VITE_TRELLO_API_KEY: "",
      VITE_ENABLE_AI_SMART_COMMAND: "false",
    },
  },
});

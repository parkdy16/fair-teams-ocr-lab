import { defineConfig } from "@playwright/test";

const auditPort = 4174;
const auditBaseUrl = `http://127.0.0.1:${auditPort}`;

export default defineConfig({
  testDir: "./tests/ux-audit",
  testMatch: "**/*.ux-audit.spec.ts",
  globalSetup: "./tests/browser/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "ux-audit-results/playwright-report", open: "never" }],
  ],
  outputDir: "ux-audit-results/playwright",
  use: {
    baseURL: auditBaseUrl,
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
    reducedMotion: "no-preference",
  },
  projects: [
    {
      name: "phone-390",
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: "phone-430",
      use: {
        viewport: { width: 430, height: 932 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: "tablet-768",
      use: {
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: "desktop-1440",
      use: {
        viewport: { width: 1440, height: 900 },
        hasTouch: false,
        deviceScaleFactor: 1,
      },
    },
  ],
});

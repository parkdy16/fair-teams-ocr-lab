import type { FullConfig } from "@playwright/test";
import { createServer } from "vite";

const smokePort = 4174;

const smokeEnvironment = {
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
} as const;

export default async function globalSetup(_config: FullConfig) {
  const previousEnvironment = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(smokeEnvironment)) {
    previousEnvironment.set(key, process.env[key]);
    process.env[key] = value;
  }

  const restoreEnvironment = () => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const server = await createServer({
      configFile: "./vite.config.ts",
      configLoader: "runner",
      logLevel: "warn",
      server: {
        host: "127.0.0.1",
        port: smokePort,
        strictPort: true,
      },
    });
    await server.listen();

    return async () => {
      try {
        await server.close();
      } finally {
        restoreEnvironment();
      }
    };
  } catch (error) {
    restoreEnvironment();
    throw error;
  }
}

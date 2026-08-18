import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  canDisconnectGoogleDrive,
  GoogleDriveConnectionController,
  isGoogleDriveAuthorizationExpiredError,
  parseGoogleDriveScopes,
  type GoogleDriveTokenResult,
} from "./googleDriveConnection.ts";
import { normalizeGoogleDriveLoginHint } from "./googleDriveAuthPolicy.ts";
import { GoogleApiHttpError } from "./googleApiError.ts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function connectionHarness(options: {
  tokenResults?: GoogleDriveTokenResult[];
  loadAccount?: (accessToken: string) => Promise<{ displayName?: string; emailAddress?: string }>;
  revokeAccessToken?: (accessToken: string) => Promise<void>;
} = {}) {
  const prompts: string[] = [];
  const loginHints: Array<string | undefined> = [];
  const revokedTokens: string[] = [];
  const scheduled: Array<() => void> = [];
  const tokenResults = [...(options.tokenResults || [{
    accessToken: "drive-token-1",
    expiresIn: 3600,
    scope: DRIVE_SCOPE,
  }])];

  const controller = new GoogleDriveConnectionController({
    requestedScope: DRIVE_SCOPE,
    requestAccessToken: async (prompt, loginHint) => {
      prompts.push(prompt);
      loginHints.push(loginHint);
      const result = tokenResults.shift();
      if (!result) throw new Error("No token result configured.");
      return result;
    },
    revokeAccessToken: options.revokeAccessToken || (async (accessToken) => {
      revokedTokens.push(accessToken);
    }),
    loadAccount: options.loadAccount || (async () => ({
      displayName: "Drive Person",
      emailAddress: "drive-account@example.com",
    })),
    now: () => 1_000_000,
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancelSchedule: () => undefined,
  });

  return { controller, prompts, loginHints, revokedTokens, scheduled };
}

test("Drive connection snapshots never expose the memory-only access token", async () => {
  const { controller } = connectionHarness();
  assert.equal("accessToken" in controller.getSnapshot(), false);

  const snapshot = await controller.connect();
  assert.equal(snapshot.status, "connected");
  assert.equal("accessToken" in snapshot, false);
  assert.equal(controller.getAccessToken(), "drive-token-1");

  const source = fs.readFileSync(new URL("./googleDriveConnection.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|firestore|URLSearchParams|location\.|console\./i);
});

test("initial connection requests consent and records Drive identity, scope and expiry", async () => {
  const { controller, prompts } = connectionHarness();
  const snapshot = await controller.connect();

  assert.deepEqual(prompts, ["consent"]);
  assert.equal(snapshot.status, "connected");
  assert.equal(snapshot.account?.emailAddress, "drive-account@example.com");
  assert.deepEqual(snapshot.requestedScopes, [DRIVE_SCOPE]);
  assert.deepEqual(snapshot.grantedScopes, [DRIVE_SCOPE]);
  assert.equal(snapshot.requiredScopeStatus, "granted");
  assert.equal(snapshot.expiresAt, 4_600_000);
});

test("a new Drive authorization can safely use a Firebase Google email as a login hint", async () => {
  const { controller, loginHints } = connectionHarness();
  await controller.connect({ loginHint: "google-organizer@example.com" });

  assert.deepEqual(loginHints, ["google-organizer@example.com"]);
  assert.equal(normalizeGoogleDriveLoginHint(" google-organizer@example.com "), "google-organizer@example.com");
  assert.equal(normalizeGoogleDriveLoginHint("not-an-email"), undefined);

  const auth = fs.readFileSync(new URL("./googleDriveAuth.ts", import.meta.url), "utf8");
  assert.match(auth, /requestAccessToken\(\{[\s\S]*?login_hint:\s*normalizeGoogleDriveLoginHint\(loginHint\)/);
  assert.doesNotMatch(auth, /drive\.google|firebase.*scope|localStorage|sessionStorage/i);
});

test("Drive account identity is independent from any Firebase identity", async () => {
  const { controller } = connectionHarness({
    loadAccount: async () => ({ emailAddress: "different-drive-account@example.com" }),
  });
  const firebaseEmail = "firebase-user@example.com";
  const snapshot = await controller.connect();

  assert.equal(snapshot.account?.emailAddress, "different-drive-account@example.com");
  assert.notEqual(snapshot.account?.emailAddress, firebaseEmail);
  const source = fs.readFileSync(new URL("./googleDriveConnection.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /firebase|currentUser|GoogleAuthProvider/i);
});

test("scheduled expiry clears the token, retains account context and reconnects without a new consent prompt", async () => {
  const { controller, prompts, scheduled } = connectionHarness({
    tokenResults: [
      { accessToken: "drive-token-1", expiresIn: 3600, scope: DRIVE_SCOPE },
      { accessToken: "drive-token-2", expiresIn: 3600, scope: DRIVE_SCOPE },
    ],
  });

  await controller.connect();
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(controller.getSnapshot().status, "expired");
  assert.equal(controller.getSnapshot().account?.emailAddress, "drive-account@example.com");
  assert.equal(controller.getAccessToken(), "");

  const reconnected = await controller.connect();
  assert.deepEqual(prompts, ["consent", ""]);
  assert.equal(reconnected.status, "connected");
  assert.equal(controller.getAccessToken(), "drive-token-2");
});

test("expired or remembered-account error state can disconnect without requesting a token", async () => {
  const { controller, prompts } = connectionHarness();
  await controller.connect();
  controller.markExpired();

  assert.equal(canDisconnectGoogleDrive(controller.getSnapshot()), true);
  assert.equal(canDisconnectGoogleDrive({ ...controller.getSnapshot(), account: null }), true);
  await controller.disconnect();
  assert.equal(controller.getSnapshot().status, "disconnected");
  assert.equal(controller.getSnapshot().account, null);
  assert.equal(canDisconnectGoogleDrive(controller.getSnapshot()), false);
  assert.deepEqual(prompts, ["consent"]);

  const errorWithAccount = {
    ...controller.getSnapshot(),
    status: "error" as const,
    account: { emailAddress: "drive-account@example.com" },
  };
  assert.equal(canDisconnectGoogleDrive(errorWithAccount), true);
  assert.equal(canDisconnectGoogleDrive({ ...errorWithAccount, account: null }), false);
});

test("disconnect clears live state before revocation completes and revokes only the Drive token", async () => {
  let finishRevocation: (() => void) | null = null;
  let revokedToken = "";
  const { controller } = connectionHarness({
    revokeAccessToken: (accessToken) => new Promise<void>((resolve) => {
      revokedToken = accessToken;
      finishRevocation = resolve;
    }),
  });
  await controller.connect();

  const disconnecting = controller.disconnect();
  assert.equal(controller.getSnapshot().status, "disconnected");
  assert.equal(controller.getSnapshot().account, null);
  assert.equal(controller.getAccessToken(), "");
  assert.equal(revokedToken, "drive-token-1");
  finishRevocation?.();

  assert.deepEqual(await disconnecting, { revoked: true, revokeError: null });
});

test("failed Google revocation still leaves the browser disconnected", async () => {
  const { controller } = connectionHarness({
    revokeAccessToken: async () => {
      throw new Error("revocation unavailable");
    },
  });
  await controller.connect();
  const result = await controller.disconnect();

  assert.equal(controller.getSnapshot().status, "disconnected");
  assert.equal(controller.getAccessToken(), "");
  assert.equal(result.revoked, false);
  assert.match(result.revokeError || "", /revocation unavailable/i);
});

test("a token missing the required Drive scope is rejected and revoked", async () => {
  const { controller, revokedTokens } = connectionHarness({
    tokenResults: [{
      accessToken: "wrong-scope-token",
      expiresIn: 3600,
      scope: "openid email",
    }],
  });
  const snapshot = await controller.connect();

  assert.equal(snapshot.status, "error");
  assert.equal(snapshot.requiredScopeStatus, "missing");
  assert.equal(controller.getAccessToken(), "");
  assert.deepEqual(revokedTokens, ["wrong-scope-token"]);
});

test("a known missing Drive scope forces consent even when reconnecting with remembered account context", async () => {
  const { controller, prompts } = connectionHarness({
    tokenResults: [
      { accessToken: "drive-token-1", expiresIn: 3600, scope: DRIVE_SCOPE },
      { accessToken: "wrong-scope-token", expiresIn: 3600, scope: "openid email" },
      { accessToken: "drive-token-2", expiresIn: 3600, scope: DRIVE_SCOPE },
    ],
  });

  await controller.connect();
  controller.markExpired();
  const missingScope = await controller.connect();
  assert.equal(missingScope.requiredScopeStatus, "missing");
  assert.equal(missingScope.account?.emailAddress, "drive-account@example.com");

  await controller.connect();
  assert.deepEqual(prompts, ["consent", "", "consent"]);
});

test("authorization failure produces an error state without retaining a token", async () => {
  const controller = new GoogleDriveConnectionController({
    requestedScope: DRIVE_SCOPE,
    requestAccessToken: async () => {
      throw new Error("popup cancelled");
    },
    revokeAccessToken: async () => undefined,
    loadAccount: async () => ({}),
  });
  const snapshot = await controller.connect();

  assert.equal(snapshot.status, "error");
  assert.match(snapshot.error || "", /popup cancelled/i);
  assert.equal(controller.getAccessToken(), "");
});

test("an authorization-expired account lookup fails closed as reconnect-required", async () => {
  const { controller, revokedTokens } = connectionHarness({
    loadAccount: async () => {
      throw Object.assign(new Error("Google Drive connection expired. Reconnect Google Drive."), { status: 401 });
    },
  });
  const snapshot = await controller.connect();

  assert.equal(snapshot.status, "expired");
  assert.equal(controller.getAccessToken(), "");
  assert.deepEqual(revokedTokens, ["drive-token-1"]);
  assert.equal(isGoogleDriveAuthorizationExpiredError({ status: 401 }), true);
});

test("structured Google API 401 errors are recognized without relying on message text", () => {
  const error = new GoogleApiHttpError(401, "arbitrary localized API message");
  assert.equal(error.status, 401);
  assert.equal(error.code, 401);
  assert.equal(isGoogleDriveAuthorizationExpiredError(error), true);

  const driveFiles = fs.readFileSync(new URL("./googleDriveFiles.ts", import.meta.url), "utf8");
  const sheetsFiles = fs.readFileSync(new URL("./googleSheetsFiles.ts", import.meta.url), "utf8");
  assert.doesNotMatch(driveFiles, /throw new Error\("Google Drive connection expired/);
  assert.doesNotMatch(sheetsFiles, /throw new Error\("Google connection expired/);
  assert.match(driveFiles, /GoogleApiHttpError\(401/);
  assert.match(sheetsFiles, /GoogleApiHttpError\(401/);
});

test("disconnect during an in-flight connection prevents stale token adoption", async () => {
  let resolveToken: ((result: GoogleDriveTokenResult) => void) | null = null;
  const revokedTokens: string[] = [];
  const controller = new GoogleDriveConnectionController({
    requestedScope: DRIVE_SCOPE,
    requestAccessToken: () => new Promise((resolve) => {
      resolveToken = resolve;
    }),
    revokeAccessToken: async (accessToken) => {
      revokedTokens.push(accessToken);
    },
    loadAccount: async () => ({ emailAddress: "drive-account@example.com" }),
  });

  const connecting = controller.connect();
  await controller.disconnect();
  resolveToken?.({ accessToken: "late-token", expiresIn: 3600, scope: DRIVE_SCOPE });
  await connecting;

  assert.equal(controller.getSnapshot().status, "disconnected");
  assert.equal(controller.getAccessToken(), "");
  assert.deepEqual(revokedTokens, ["late-token"]);
});

test("scope parsing is stable for empty and repeated whitespace", () => {
  assert.deepEqual(parseGoogleDriveScopes(), []);
  assert.deepEqual(parseGoogleDriveScopes(`  ${DRIVE_SCOPE}   email `), [DRIVE_SCOPE, "email"]);
});

test("App delegates Drive lifecycle while preserving existing Cloud Backup token call sites", () => {
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /new GoogleDriveConnectionController/);
  assert.match(app, /googleDriveConnection\.getAccessToken\(\)/);
  assert.match(app, /createGoogleDriveJsonFile\(\s*googleDriveAccessToken,/);
  assert.match(app, /readGoogleDriveJsonFile\(googleDriveAccessToken,/);
  assert.doesNotMatch(app, /setGoogleDriveAccessToken/);

  const disconnect = app.slice(
    app.indexOf("const disconnectGoogleDrive"),
    app.indexOf("const preserveLocalImagesForDriveRosters"),
  );
  assert.match(disconnect, /googleDriveConnection\.disconnect\(\)/);
  assert.match(app, /!googleDriveConnected && googleDriveCanDisconnect/);
  assert.doesNotMatch(disconnect, /setCurrentDriveBackup\(null\)/);
  assert.doesNotMatch(disconnect, /firebase|workspace|delete/i);
});

test("browser disconnect uses the supported GIS revocation API without touching Firebase auth", () => {
  const auth = fs.readFileSync(new URL("./googleDriveAuth.ts", import.meta.url), "utf8");
  const revoke = auth.slice(auth.indexOf("export async function revokeGoogleDriveAccessToken"));
  assert.match(revoke, /accounts\?\.oauth2/);
  assert.match(revoke, /revoke\(token,/);
  assert.doesNotMatch(revoke, /firebase|signOut|deleteUser|localStorage|sessionStorage/i);
});

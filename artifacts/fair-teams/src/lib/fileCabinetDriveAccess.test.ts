import assert from "node:assert/strict";
import test from "node:test";
import {
  fileCabinetDriveAccessToken,
  fileCabinetGoogleLoginHint,
} from "./fileCabinetDriveAccess.ts";

test("Google-authenticated Stripes users provide the same-account Drive login hint", () => {
  assert.equal(fileCabinetGoogleLoginHint({
    uid: "firebase-uid",
    email: "organizer@example.com",
    emailVerified: true,
    providerIds: ["password", "google.com"],
  }), "organizer@example.com");
  assert.equal(fileCabinetGoogleLoginHint({
    uid: "password-uid",
    email: "password@example.com",
    emailVerified: true,
    providerIds: ["password"],
  }), undefined);
});

test("an existing explicit Drive session is reused without requesting or switching accounts", async () => {
  let requests = 0;
  const token = await fileCabinetDriveAccessToken({
    driveStatus: "connected",
    accessToken: "existing-drive-token",
    rememberedDriveAccount: "different-drive@example.com",
    googleLoginHint: "firebase-google@example.com",
    requestDriveAccess: async () => {
      requests += 1;
      return "replacement-token";
    },
  });
  assert.equal(token, "existing-drive-token");
  assert.equal(requests, 0);
});

test("File Cabinet requests Drive only when its action needs authorization", async () => {
  const hints: Array<string | undefined> = [];
  const requestDriveAccess = async (hint?: string) => {
    hints.push(hint);
    return "new-drive-token";
  };

  assert.deepEqual(hints, []);
  assert.equal(await fileCabinetDriveAccessToken({
    driveStatus: "disconnected",
    accessToken: "",
    googleLoginHint: "firebase-google@example.com",
    requestDriveAccess,
  }), "new-drive-token");
  assert.deepEqual(hints, ["firebase-google@example.com"]);
});

test("remembered Drive account context is not replaced by a Firebase Google hint", async () => {
  const hints: Array<string | undefined> = [];
  await fileCabinetDriveAccessToken({
    driveStatus: "expired",
    accessToken: "",
    rememberedDriveAccount: "remembered-drive@example.com",
    googleLoginHint: "firebase-google@example.com",
    requestDriveAccess: async (hint) => {
      hints.push(hint);
      return "reconnected-token";
    },
  });
  assert.deepEqual(hints, [undefined]);
});

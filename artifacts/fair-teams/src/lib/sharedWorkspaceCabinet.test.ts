import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  isSameSharedWorkspaceCabinetLocation,
  myDriveCabinetLocationDraft,
  sharedDriveCabinetLocationDraft,
  validateSharedWorkspaceCabinetLocationDraft,
  type SharedWorkspaceCabinetLocation,
} from "./sharedWorkspaceCabinet.ts";

test("validates provider-neutral My Drive metadata", () => {
  assert.deepEqual(validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-folder-1",
    displayName: "Friday Football Cabinet",
  }), {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-folder-1",
    displayName: "Friday Football Cabinet",
  });
});

test("validates Shared Drive metadata and requires driveId", () => {
  const shared = validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: 1,
    provider: "google_drive",
    backing: "shared_drive",
    folderId: "shared-folder-1",
    driveId: "shared-drive-1",
  });
  assert.equal(shared.backing, "shared_drive");
  assert.equal(shared.driveId, "shared-drive-1");
  assert.throws(() => validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: 1,
    provider: "google_drive",
    backing: "shared_drive",
    folderId: "shared-folder-1",
  }), /Shared Drive/);
});

test("rejects unknown and credential-like fields", () => {
  for (const forbidden of ["accessToken", "refreshToken", "oauthCredential", "hostGoogleEmail"]) {
    assert.throws(() => validateSharedWorkspaceCabinetLocationDraft({
      schemaVersion: 1,
      provider: "google_drive",
      backing: "my_drive",
      folderId: "my-folder-1",
      [forbidden]: "secret",
    }), /unsupported fields/);
  }
  assert.throws(() => validateSharedWorkspaceCabinetLocationDraft({
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-folder-1",
    driveId: "not-allowed",
  }), /cannot include/);
});

test("normalizes the accepted G2.2 and G2.4 results into one metadata model", () => {
  assert.equal(myDriveCabinetLocationDraft({
    id: "managed-my-folder",
    name: "Renamed by user",
    mimeType: "application/vnd.google-apps.folder",
  }).folderId, "managed-my-folder");
  assert.deepEqual(sharedDriveCabinetLocationDraft({
    status: "ready",
    provider: "google_drive",
    backing: "shared_drive",
    folderId: "shared-folder",
    driveId: "shared-drive",
    displayName: "Board documents",
    capabilities: {
      canReadDrive: true,
      canListChildren: true,
      canAddChildren: true,
      canEdit: true,
    },
  }), {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "shared_drive",
    folderId: "shared-folder",
    driveId: "shared-drive",
    displayName: "Board documents",
  });
});

test("replacement identity compares stable IDs rather than presentation name", () => {
  const current: SharedWorkspaceCabinetLocation = {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "stable-folder",
    displayName: "Old name",
    configuredByUid: "firebase-organizer",
  };
  assert.equal(isSameSharedWorkspaceCabinetLocation(current, {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "stable-folder",
    displayName: "Renamed folder",
  }), true);
  assert.equal(isSameSharedWorkspaceCabinetLocation(current, {
    schemaVersion: 1,
    provider: "google_drive",
    backing: "my_drive",
    folderId: "replacement-folder",
  }), false);
});

test("Firestore service stores Firebase organizer attribution without Google identity or credentials", () => {
  const service = fs.readFileSync(new URL("./sharedWorkspaceCabinetService.ts", import.meta.url), "utf8");
  assert.match(service, /getFairTeamsAuth\(\)\.currentUser\?\.uid/);
  assert.match(service, /configuredByUid/);
  assert.doesNotMatch(service, /emailAddress|Google.*email|accessToken|refreshToken|localStorage|sessionStorage/i);
  assert.doesNotMatch(service, /googleDrive|deleteFiles|trashGoogle|revokeGoogle/i);
});

test("configuration UI requires explicit replacement and removal confirmation", () => {
  const component = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");
  assert.match(component, /Change Club Cabinet\?/);
  assert.match(component, /Existing folders and files will remain unchanged in Google Drive/);
  assert.match(component, /Remove Club Cabinet relationship\?/);
  assert.match(component, /will not be changed or deleted/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  isSameSharedWorkspaceCabinetLocation,
  myDriveCabinetLocationDraft,
  parseSharedWorkspaceCabinetLocation,
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

test("rejects missing and future File Cabinet schema versions", () => {
  const cabinet = {
    provider: "google_drive",
    backing: "my_drive",
    folderId: "my-folder-1",
  };

  assert.throws(
    () => validateSharedWorkspaceCabinetLocationDraft(cabinet),
    /location version is not supported/,
  );
  assert.throws(
    () => validateSharedWorkspaceCabinetLocationDraft({
      ...cabinet,
      schemaVersion: 2,
    }),
    /location version is not supported/,
  );
  assert.equal(parseSharedWorkspaceCabinetLocation({
    ...cabinet,
    configuredByUid: "firebase-organizer",
  }), null);
  assert.equal(parseSharedWorkspaceCabinetLocation({
    ...cabinet,
    schemaVersion: 2,
    configuredByUid: "firebase-organizer",
  }), null);
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
  assert.match(component, /Change File Cabinet\?/);
  assert.match(component, /Existing folders and files will remain unchanged in Google Drive/);
  assert.match(component, /Remove File Cabinet relationship\?/);
  assert.match(component, /will not be changed or deleted/);
});

test("File Cabinet is a dedicated Club destination outside Club Access", () => {
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const club = fs.readFileSync(new URL("../components/ClubTab.tsx", import.meta.url), "utf8");
  const component = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");
  const sharedTools = app.slice(
    app.indexOf("sharedToolsNode={("),
    app.indexOf("fileCabinetNode=", app.indexOf("sharedToolsNode={(")),
  );

  assert.doesNotMatch(sharedTools, /SharedWorkspaceCabinetCard|File Cabinet/);
  assert.match(app, /fileCabinetNode=.*SharedWorkspaceCabinetCard/s);
  assert.match(club, /fileCabinetNode\?\.\(\{[\s\S]*?fileCabinetOpen/);
  assert.match(component, /aria-label="File Cabinet"/);
  assert.match(component, /<Dialog open=\{open\} onOpenChange=\{onOpenChange\}>/);
  assert.match(component, /Club files and documents/);
  assert.match(component, /location \? \([\s\S]*?!driveReady[\s\S]*?Reconnect Google Drive/);
  assert.match(component, /location \? \([\s\S]*?: \([\s\S]*?Set up File Cabinet[\s\S]*?Use My Drive[\s\S]*?Choose Shared Drive/);
});

test("File Cabinet actions resume automatically after Drive authorization", () => {
  const component = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");
  const myDrive = component.slice(
    component.indexOf("const useManagedMyDrive"),
    component.indexOf("const chooseSharedDrive"),
  );
  const sharedDrive = component.slice(
    component.indexOf("const chooseSharedDrive"),
    component.indexOf("const removeLocation"),
  );

  assert.match(myDrive, /await driveTokenForAction\(\)[\s\S]*?resolveManagedMyDriveCabinetFolder\(actionToken\)[\s\S]*?prepareLocation/);
  assert.match(sharedDrive, /await driveTokenForAction\(\)[\s\S]*?selectGoogleDriveSharedCabinetLocation\(actionToken\)[\s\S]*?prepareLocation/);
  assert.doesNotMatch(sharedDrive, /resolveManagedMyDriveCabinetFolder/);
});

test("connectGoogleDrive remains generic and Cabinet-neutral", () => {
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const connect = app.slice(
    app.indexOf("const connectGoogleDrive"),
    app.indexOf("const disconnectGoogleDrive"),
  );

  assert.doesNotMatch(connect, /getSharedWorkspaceCabinetLocation/);
  assert.doesNotMatch(connect, /resolveManagedMyDriveCabinetFolder/);
  assert.doesNotMatch(connect, /resolveGoogleDriveSharedCabinetLocation/);
  assert.doesNotMatch(connect, /googleDriveCabinet\.resolve/);
  assert.match(connect, /googleDriveConnection\.connect\(\{ loginHint: options\?\.loginHint \}\)/);
  assert.match(connect, /void warmUpGoogleDrivePicker\(\)/);
  assert.match(connect, /showRosterToolsNotice\([\s\S]*?\"Google Drive connected\"[\s\S]*?\"Google Drive is ready to use for backup and sheets\.\"/);
});

test("File Cabinet continuation remains explicit after authorization", () => {
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const component = fs.readFileSync(new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url), "utf8");

  const myDrive = component.slice(
    component.indexOf("const useManagedMyDrive"),
    component.indexOf("const chooseSharedDrive"),
  );
  const sharedDrive = component.slice(
    component.indexOf("const chooseSharedDrive"),
    component.indexOf("const removeLocation"),
  );
  const suite = app.slice(app.indexOf("fileCabinetNode="), app.indexOf("equipmentGroupId="));

  assert.match(myDrive, /const actionToken = await driveTokenForAction\(\);[\s\S]*?resolveManagedMyDriveCabinetFolder\(actionToken\);/);
  assert.match(sharedDrive, /const actionToken = await driveTokenForAction\(\);[\s\S]*?selectGoogleDriveSharedCabinetLocation\(actionToken\);/);
  assert.match(suite, /onConnectDrive=\{async \(loginHint\) => \(\s*await connectGoogleDrive\(\{ loginHint \}\) \|\| ""\s*\)\}/);
  assert.match(suite, /<SharedWorkspaceCabinetCard/);
  assert.doesNotMatch(suite, /fileCabinetAction:/);
});

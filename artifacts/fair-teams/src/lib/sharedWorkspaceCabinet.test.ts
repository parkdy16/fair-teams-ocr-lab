import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getEnglishCatalogMessage } from "../i18n/resources/en.ts";
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
  assert.match(component, /t\("cabinet\.confirm\.changeTitle"\)/);
  assert.match(component, /t\("cabinet\.confirm\.changeDescription"\)/);
  assert.match(component, /t\("cabinet\.confirm\.removeRelationshipTitle"\)/);
  assert.match(component, /t\("cabinet\.confirm\.removeRelationshipDescription"\)/);
  assert.equal(getEnglishCatalogMessage("cabinet.confirm.changeTitle"), "Change File Cabinet?");
  assert.equal(
    getEnglishCatalogMessage("cabinet.confirm.changeDescription"),
    "Stripes will stop using the current Google folder as this club’s File Cabinet. Existing folders and files will remain unchanged in Google Drive.",
  );
  assert.equal(getEnglishCatalogMessage("cabinet.confirm.removeRelationshipTitle"), "Remove File Cabinet relationship?");
  assert.equal(
    getEnglishCatalogMessage("cabinet.confirm.removeRelationshipDescription"),
    "Stripes will forget this club’s File Cabinet location. The Google folder, files and Google permissions will not be changed or deleted.",
  );
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
  assert.match(component, /aria-label=\{t\("cabinet\.title"\)\}/);
  assert.match(component, /<Dialog open=\{open\} onOpenChange=\{onOpenChange\}>/);
  assert.match(component, /t\("cabinet\.subtitle"\)/);
  assert.match(component, /location \? \([\s\S]*?!driveReady[\s\S]*?t\("cabinet\.reconnectGoogleDrive"\)/);
  assert.match(component, /location \? \([\s\S]*?: \([\s\S]*?t\("cabinet\.setup"\)[\s\S]*?t\("cabinet\.useMyDrive"\)[\s\S]*?t\("cabinet\.chooseSharedDrive"\)/);
  assert.equal(getEnglishCatalogMessage("cabinet.title"), "File Cabinet");
  assert.equal(getEnglishCatalogMessage("cabinet.subtitle"), "Club files and documents");
  assert.equal(getEnglishCatalogMessage("cabinet.reconnectGoogleDrive"), "Reconnect Google Drive");
  assert.equal(getEnglishCatalogMessage("cabinet.setup"), "Set up File Cabinet");
  assert.equal(getEnglishCatalogMessage("cabinet.useMyDrive"), "Use My Drive");
  assert.equal(getEnglishCatalogMessage("cabinet.chooseSharedDrive"), "Choose Shared Drive");
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
  assert.match(connect, /showRosterToolsNotice\([\s\S]*?t\("app\.notices\.googleDriveConnected\.title"\)[\s\S]*?t\("app\.notices\.googleDriveConnected\.message"\)/);
  assert.equal(getEnglishCatalogMessage("app.notices.googleDriveConnected.title"), "Google Drive connected");
  assert.equal(getEnglishCatalogMessage("app.notices.googleDriveConnected.message"), "Google Drive is ready to use for backup and sheets.");
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

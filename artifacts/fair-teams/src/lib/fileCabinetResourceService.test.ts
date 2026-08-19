import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(
  new URL("./fileCabinetResourceService.ts", import.meta.url),
  "utf8",
);
const cabinetUi = fs.readFileSync(
  new URL("../components/SharedWorkspaceCabinetCard.tsx", import.meta.url),
  "utf8",
);

function functionSource(name: string, nextName?: string) {
  const start = service.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must be exported.`);
  const end = nextName
    ? service.indexOf(`export async function ${nextName}`, start + 1)
    : service.length;
  assert.notEqual(end, -1, `${nextName} must follow ${name}.`);
  return service.slice(start, end);
}

test("uses the isolated group and standalone-roster Cabinet resource paths", () => {
  assert.match(service, /clean\.kind === "group" \? "sharedGroups" : "sharedRosters"/);
  assert.match(service, /clean\.id,\s*"cabinetResources"/);
  assert.doesNotMatch(service, /"resources"/);
  assert.match(service, /SharedWorkspaceCabinetScope/);
});

test("create generates the Stripes resource ID and stores Firebase attribution", () => {
  const create = functionSource(
    "createFileCabinetResource",
    "listFileCabinetResources",
  );
  assert.match(create, /const reference = doc\(fileCabinetResourcesCollection\(scope\)\)/);
  assert.match(create, /resourceId: reference\.id/);
  assert.match(create, /createdByUid: uid/);
  assert.match(create, /createdAt: serverTimestamp\(\)/);
  assert.match(create, /updatedByUid: uid/);
  assert.match(create, /updatedAt: serverTimestamp\(\)/);
  assert.match(create, /return reference\.id/);
});

test("metadata update changes only presentation contexts and update attribution", () => {
  const update = functionSource(
    "updateFileCabinetResourceMetadata",
    "removeFileCabinetResource",
  );
  assert.match(update, /validateFileCabinetResourceMetadataUpdate\(value\)/);
  assert.match(update, /displayName: update\.displayName/);
  assert.match(update, /contexts: update\.contexts/);
  assert.match(update, /updatedByUid: uid/);
  assert.match(update, /updatedAt: serverTimestamp\(\)/);
  assert.doesNotMatch(
    update,
    /providerResourceId:|externalUrl:|resourceKind:|origin:|createdByUid:/,
  );
});

test("remove transaction blocks feature relationships before deleting metadata", () => {
  const remove = functionSource("removeFileCabinetResource");
  assert.match(remove, /requireCurrentFirebaseUid\(\)/);
  assert.match(remove, /runTransaction\(getFairTeamsFirestore\(\), async \(transaction\)/);
  assert.match(remove, /transaction\.get\(reference\)/);
  assert.match(remove, /parseFileCabinetResource\(snapshot\.id, snapshot\.data\(\)\)/);
  assert.match(remove, /checkFileCabinetResourceRemoval\(resource\)/);
  assert.match(remove, /removal\.status === "blocked_by_relationships"/);
  assert.match(remove, /transaction\.delete\(reference\)/);
  assert.doesNotMatch(remove, /deleteDoc\(/);
  assert.doesNotMatch(
    remove,
    /deleteObject|trash|fetch|google|provider|firebase\/storage|storageRef|contexts:/i,
  );
});

test("Cabinet UI preflights relationships and handles the atomic service result", () => {
  assert.match(cabinetUi, /checkFileCabinetResourceRemoval\(resource\)/);
  assert.match(cabinetUi, /result\.status === "blocked_by_relationships"/);
  assert.match(cabinetUi, /setResourceNotice\(result\.message\)/);
  assert.match(cabinetUi, /Cabinet-only shared index record/);
  assert.match(cabinetUi, /Items tied to Action Board or Equipment cannot be removed here/);
  assert.doesNotMatch(cabinetUi, /saved Stripes context links/);
});

test("service has no provider, credential, ACL, email, or byte-storage dependency", () => {
  assert.doesNotMatch(service, /firebase\/storage|googleDrive|accessToken|refreshToken|fetch\(/i);
  assert.doesNotMatch(service, /email|permission|fileBytes|deleteObject|trashGoogle/i);
  assert.match(service, /getFairTeamsAuth\(\)\.currentUser\?\.uid/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSharedWorkspaceContextKey,
  activeSharedWorkspaceResolutionIsCurrent,
  resolveActiveSharedWorkspaceAuthority,
  unavailableActiveSharedWorkspaceAuthority,
  unresolvedActiveSharedWorkspaceAuthority,
  type ActiveSharedWorkspaceReference,
} from "./activeSharedWorkspaceAuthorityState.ts";

const userA = {
  uid: "uid-a",
  email: "a@example.com",
  displayName: "A",
  emailVerified: true,
  providerIds: ["password"],
};
const userB = { ...userA, uid: "uid-b", email: "b@example.com", displayName: "B" };

const reference = (overrides: Partial<ActiveSharedWorkspaceReference> = {}) => ({
  localRosterId: "local-roster",
  firebaseRosterId: "roster-1",
  cachedFirebaseGroupId: "group-1",
  ...overrides,
});

const roster = (role: "owner" | "editor" | "organizer" | "viewer" | "member" = "organizer", groupId: string | null = "group-1") => ({
  id: "roster-1",
  groupId: groupId || undefined,
  name: "Friday Football",
  ownerUid: "uid-owner",
  ownerEmail: "owner@example.com",
  version: 4,
  playerCount: 12,
  currentUserRole: role,
  memberEmails: [userA.email],
});

const group = (role: "owner" | "editor" | "organizer" | "viewer" | "member" = "organizer") => ({
  id: "group-1",
  name: "Friday Club",
  ownerUid: "uid-owner",
  ownerEmail: "owner@example.com",
  rosterCount: 1,
  memberCount: 2,
  currentUserRole: role,
  memberEmails: [userA.email],
  pendingInviteEmails: [],
});

test("cached organizer is denied when the current UID is omitted authoritatively", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [], groups: [] },
  );
  assert.equal(result.status, "access_lost");
  assert.equal(result.capabilities.canEditSharedRoster, false);
  assert.equal(result.capabilities.canUseFileCabinet, false);
  assert.equal(result.capabilities.canManageOrganizers, false);
  assert.equal(result.reference.firebaseRosterId, "roster-1");
});

test("signed-out shared reference has no online capability", () => {
  const result = unresolvedActiveSharedWorkspaceAuthority(reference(), true, null);
  assert.equal(result.status, "signed_out");
  assert.deepEqual(Object.values(result.capabilities), Object.values(result.capabilities).map(() => false));
});

test("account and roster switches invalidate old asynchronous resolutions", () => {
  const aKey = activeSharedWorkspaceContextKey(reference(), userA.uid);
  const bKey = activeSharedWorkspaceContextKey(reference(), userB.uid);
  const otherRosterKey = activeSharedWorkspaceContextKey(reference({ firebaseRosterId: "roster-2" }), userA.uid);
  assert.equal(activeSharedWorkspaceResolutionIsCurrent(4, 5, aKey, aKey), false);
  assert.equal(activeSharedWorkspaceResolutionIsCurrent(5, 5, aKey, bKey), false);
  assert.equal(activeSharedWorkspaceResolutionIsCurrent(5, 5, aKey, otherRosterKey), false);
  assert.equal(activeSharedWorkspaceResolutionIsCurrent(5, 5, aKey, aKey), true);

  const resultForB = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userB,
    { userUid: userB.uid, rosters: [], groups: [] },
  );
  assert.equal(resultForB.status, "access_lost");
  assert.equal(resultForB.capabilities.canEditSharedRoster, false);
});

test("authoritative organizer overrides a cached viewer", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster("organizer")], groups: [group("organizer")] },
  );
  assert.equal(result.status, "authorized");
  assert.equal(result.capabilities.canEditSharedRoster, true);
  assert.equal(result.capabilities.canRestoreSharedRosterBackup, true);
  assert.equal(result.capabilities.canUseFileCabinet, true);
});

test("authoritative viewer overrides a cached organizer", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster("viewer")], groups: [group("viewer")] },
  );
  assert.equal(result.capabilities.canReadSharedRoster, true);
  assert.equal(result.capabilities.canReadClubRatings, true);
  assert.equal(result.capabilities.canEditSharedRoster, false);
  assert.equal(result.capabilities.canEditEquipment, false);
  assert.equal(result.capabilities.canUseFileCabinet, false);
});

test("linked ordinary member receives only current member capabilities", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster("member")], groups: [group("member")] },
  );
  assert.equal(result.status, "authorized");
  assert.equal(result.capabilities.canReadSharedRoster, true);
  assert.equal(result.capabilities.canReadEquipment, true);
  assert.equal(result.capabilities.canReadAttendance, true);
  assert.equal(result.capabilities.canReadClubRatings, true);
  assert.equal(result.capabilities.canRatePlayer, true);
  assert.equal(result.capabilities.canReadActionBoard, true);
  assert.equal(result.capabilities.canUseClubNotes, true);
  assert.equal(result.capabilities.canEditSharedRoster, false);
  assert.equal(result.capabilities.canManageOrganizers, false);
  assert.equal(result.capabilities.canEditEquipment, false);
  assert.equal(result.capabilities.canEditAttendance, false);
  assert.equal(result.capabilities.canEditActionBoard, false);
  assert.equal(result.capabilities.canVoteActionBoard, false);
  assert.equal(result.capabilities.canUseFileCabinet, false);
});

test("authority loading fails closed despite cached organizer metadata", () => {
  const result = unresolvedActiveSharedWorkspaceAuthority(reference(), true, userA);
  assert.equal(result.status, "loading");
  assert.equal(result.capabilities.canEditSharedRoster, false);
  assert.equal(result.capabilities.canReadActionBoard, false);
});

test("query errors are unavailable, preserve the local reference, and are not access loss", () => {
  const result = unavailableActiveSharedWorkspaceAuthority(reference(), userA, new Error("offline"));
  assert.equal(result.status, "unavailable");
  assert.equal(result.reference.localRosterId, "local-roster");
  assert.equal(result.reference.firebaseRosterId, "roster-1");
  assert.equal(result.capabilities.canReadSharedRoster, false);
});

test("successful omission is stable access loss without deleting the remembered reference", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [], groups: [group()] },
  );
  assert.equal(result.status, "access_lost");
  assert.equal(result.reference.cachedFirebaseGroupId, "group-1");
});

test("consistent linked organizer receives the approved organizer capabilities", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster()], groups: [group()] },
  );
  assert.equal(result.capabilities.canEditSharedRoster, true);
  assert.equal(result.capabilities.canManageInvitations, true);
  assert.equal(result.capabilities.canEditEquipment, true);
  assert.equal(result.capabilities.canEditAttendance, true);
  assert.equal(result.capabilities.canRatePlayer, true);
  assert.equal(result.capabilities.canEditActionBoard, true);
  assert.equal(result.capabilities.canVoteActionBoard, true);
  assert.equal(result.capabilities.canUseClubNotes, true);
});

test("roster/group divergence fails closed per operation requirements", () => {
  const rosterOnly = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster("organizer")], groups: [] },
  );
  assert.equal(rosterOnly.capabilities.canReadSharedRoster, true);
  assert.equal(rosterOnly.capabilities.canEditEquipment, true);
  assert.equal(rosterOnly.capabilities.canEditSharedRoster, false);
  assert.equal(rosterOnly.capabilities.canUseFileCabinet, false);
  assert.ok(rosterOnly.issues.includes("authoritative_group_membership_missing"));

  const groupOnly = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [], groups: [group("organizer")] },
  );
  assert.equal(groupOnly.status, "access_lost");
  assert.equal(groupOnly.capabilities.canManageOrganizers, false);

  const roleMismatch = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster("organizer")], groups: [group("viewer")] },
  );
  assert.equal(roleMismatch.capabilities.canEditEquipment, true);
  assert.equal(roleMismatch.capabilities.canEditSharedRoster, false);
  assert.equal(roleMismatch.capabilities.canManageOrganizers, false);
  assert.ok(roleMismatch.issues.includes("roster_group_roles_differ"));
});

test("the server roster group ID overrides stale local group metadata", () => {
  const serverGroup = { ...group(), id: "server-group" };
  const result = resolveActiveSharedWorkspaceAuthority(
    reference({ cachedFirebaseGroupId: "cached-wrong-group" }),
    userA,
    {
      userUid: userA.uid,
      rosters: [roster("organizer", "server-group")],
      groups: [serverGroup],
    },
  );
  assert.equal(result.authoritativeGroupId, "server-group");
  assert.equal(result.group?.id, "server-group");
  assert.ok(result.issues.includes("cached_group_id_differs_from_authoritative_roster"));
});

test("a malformed authoritative group ID fails closed instead of being normalized into another path", () => {
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    {
      userUid: userA.uid,
      rosters: [roster("organizer", " group-1 ")],
      groups: [group("organizer")],
    },
  );
  assert.equal(result.capabilities.canReadSharedRoster, true);
  assert.equal(result.capabilities.canEditEquipment, true);
  assert.equal(result.capabilities.canEditSharedRoster, false);
  assert.equal(result.capabilities.canUseClubAccess, false);
  assert.equal(result.capabilities.canUseFileCabinet, false);
  assert.ok(result.issues.includes("authoritative_roster_group_id_malformed"));
});

test("standalone shared roster preserves roster-member and organizer behavior", () => {
  const organizer = resolveActiveSharedWorkspaceAuthority(
    reference({ cachedFirebaseGroupId: undefined }),
    userA,
    { userUid: userA.uid, rosters: [roster("organizer", null)], groups: [] },
  );
  assert.equal(organizer.authoritativeGroupId, undefined);
  assert.equal(organizer.capabilities.canEditSharedRoster, true);
  assert.equal(organizer.capabilities.canUseFileCabinet, true);
  assert.equal(organizer.capabilities.canManageInvitations, false);

  const member = resolveActiveSharedWorkspaceAuthority(
    reference({ cachedFirebaseGroupId: undefined }),
    userA,
    { userUid: userA.uid, rosters: [roster("member", null)], groups: [] },
  );
  assert.equal(member.capabilities.canReadSharedRoster, true);
  assert.equal(member.capabilities.canRatePlayer, true);
  assert.equal(member.capabilities.canEditSharedRoster, false);
});

test("new organizer waiting period does not block ordinary organizer capabilities", () => {
  const waitingGroup = {
    ...group(),
    organizerGovernanceEligibleAtByUid: { [userA.uid]: "2099-01-01T00:00:00.000Z" },
  };
  const result = resolveActiveSharedWorkspaceAuthority(
    reference(),
    userA,
    { userUid: userA.uid, rosters: [roster()], groups: [waitingGroup] },
  );
  assert.equal(result.capabilities.canEditSharedRoster, true);
  assert.equal(result.capabilities.canEditActionBoard, true);
  assert.equal(result.capabilities.canVoteActionBoard, true);
  // Eligibility timing remains enforced by the protected-removal governance flow,
  // not by ordinary workspace capability derivation.
  assert.equal(result.capabilities.canUseProtectedGovernance, true);
});

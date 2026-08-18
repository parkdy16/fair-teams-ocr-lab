"use strict";

const crypto = require("node:crypto");

const {
  organizerUidsFromWorkspace,
  resolveMemberEmailByUid,
} = require("./organizerRemoval");
const { preflightGroupRosterLinkage } = require("./workspaceRosterLinkage");

const MAX_ROSTER_DATA_BYTES = 750_000;
const MAX_ROSTER_PLAYERS = 500;
const ALLOWED_REQUEST_KEYS = new Set([
  "creationRequestId",
  "groupId",
  "name",
  "rosterData",
]);
const ALLOWED_ROSTER_DATA_KEYS = new Set([
  "id",
  "name",
  "players",
  "pairingRules",
  "themeColor",
  "createdAt",
  "updatedAt",
]);

class SharedRosterCreationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SharedRosterCreationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SharedRosterCreationError(code, message);
}

function isPlainRecord(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function cleanDocumentId(value, label) {
  if (typeof value !== "string") fail("invalid-argument", `Choose a valid ${label}.`);
  const id = value.trim();
  if (!id || id !== value || id.length > 200 || id.includes("/")) {
    fail("invalid-argument", `Choose a valid ${label}.`);
  }
  return id;
}

function cleanContentId(value, label) {
  if (typeof value !== "string") fail("invalid-argument", `Choose a valid ${label}.`);
  const id = value.trim();
  if (!id || id.length > 300) fail("invalid-argument", `Choose a valid ${label}.`);
  return id;
}

function cleanCreationRequestId(value) {
  if (typeof value !== "string"
    || value.length < 20
    || value.length > 128
    || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("invalid-argument", "Choose a valid shared-roster creation request.");
  }
  return value;
}

function cleanText(value, fallback, maxLength) {
  if (value !== undefined && typeof value !== "string") {
    fail("invalid-argument", "The shared roster payload is invalid.");
  }
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function assertAllowedKeys(record, allowedKeys) {
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    fail("invalid-argument", "The shared roster payload contains unsupported fields.");
  }
}

function cleanRosterData(value, rosterName) {
  if (!isPlainRecord(value)) fail("invalid-argument", "The shared roster payload is invalid.");
  assertAllowedKeys(value, ALLOWED_ROSTER_DATA_KEYS);

  const rosterId = cleanContentId(value.id, "local roster");
  if (!Array.isArray(value.players)
    || value.players.length === 0
    || value.players.length > MAX_ROSTER_PLAYERS) {
    fail("invalid-argument", "Add a valid player list before creating a shared roster.");
  }

  const playerIds = new Set();
  value.players.forEach((player) => {
    if (!isPlainRecord(player)) fail("invalid-argument", "The shared roster player data is invalid.");
    const playerId = cleanContentId(player.id, "player");
    if (playerIds.has(playerId)) fail("invalid-argument", "The shared roster contains duplicate players.");
    playerIds.add(playerId);
    if (typeof player.name !== "string" || !player.name.trim() || player.name.length > 160) {
      fail("invalid-argument", "The shared roster player data is invalid.");
    }
  });

  if (value.pairingRules !== undefined && !Array.isArray(value.pairingRules)) {
    fail("invalid-argument", "The shared roster pairing data is invalid.");
  }
  if (Array.isArray(value.pairingRules) && value.pairingRules.length > 1_000) {
    fail("invalid-argument", "The shared roster pairing data is too large.");
  }
  if (value.themeColor !== undefined
    && (typeof value.themeColor !== "string" || value.themeColor.length > 80)) {
    fail("invalid-argument", "The shared roster theme is invalid.");
  }
  for (const timestampKey of ["createdAt", "updatedAt"]) {
    if (value[timestampKey] !== undefined
      && (typeof value[timestampKey] !== "string" || value[timestampKey].length > 100)) {
      fail("invalid-argument", "The shared roster timestamps are invalid.");
    }
  }

  let serialized;
  try {
    serialized = JSON.stringify({ ...value, id: rosterId, name: rosterName });
  } catch (_) {
    fail("invalid-argument", "The shared roster payload is invalid.");
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_ROSTER_DATA_BYTES) {
    fail("resource-exhausted", "This roster is too large to share.");
  }
  return JSON.parse(serialized);
}

function validateLinkedSharedRosterRequest(input) {
  if (!isPlainRecord(input)) fail("invalid-argument", "Choose a shared roster to create.");
  assertAllowedKeys(input, ALLOWED_REQUEST_KEYS);
  const creationRequestId = cleanCreationRequestId(input.creationRequestId);
  const groupId = cleanDocumentId(input.groupId, "shared workspace");
  const name = cleanText(input.name, "Shared roster", 120);
  const rosterData = cleanRosterData(input.rosterData, name);
  return { creationRequestId, groupId, name, rosterData };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function materialCreationValue(value) {
  if (Array.isArray(value)) return value.map((item) => materialCreationValue(item));
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "createdAt" && key !== "updatedAt")
      .map(([key, nested]) => [key, materialCreationValue(nested)]),
  );
}

function creationPayloadFingerprint(request) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(materialCreationValue({
      groupId: request.groupId,
      name: request.name,
      rosterData: request.rosterData,
    })), "utf8")
    .digest("hex");
}

function creationRequestDocumentId({ actorUid, groupId, creationRequestId }) {
  const uid = typeof actorUid === "string" ? actorUid.trim() : "";
  if (!uid) fail("unauthenticated", "Sign in before creating a shared roster.");
  const cleanGroupId = cleanDocumentId(groupId, "shared workspace");
  const cleanRequestId = cleanCreationRequestId(creationRequestId);
  return crypto
    .createHash("sha256")
    .update(`${uid}\u0000${cleanGroupId}\u0000${cleanRequestId}`, "utf8")
    .digest("hex");
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function record(value) {
  return isPlainRecord(value) ? { ...value } : {};
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function rosterResult(rosterId, data) {
  return {
    ok: true,
    roster: {
      id: rosterId,
      groupId: String(data.groupId || ""),
      groupName: String(data.groupName || "My Stripes group"),
      name: String(data.name || "Shared roster"),
      ownerUid: String(data.ownerUid || ""),
      ownerEmail: String(data.ownerEmail || ""),
      version: Number.isFinite(data.version) ? data.version : 1,
      playerCount: Number.isFinite(data.playerCount) ? data.playerCount : 0,
      createdAt: typeof data.createdAtIso === "string" ? data.createdAtIso : undefined,
      updatedAt: typeof data.updatedAtIso === "string" ? data.updatedAtIso : undefined,
      memberEmails: stringArray(data.memberEmails),
      pendingInviteEmails: stringArray(data.pendingInviteEmails),
      memberNamesByUid: record(data.memberNamesByUid),
      memberNamesByEmail: record(data.memberNamesByEmail),
      memberUidByEmail: record(data.memberUidByEmail),
      lastSavedByEmail: typeof data.lastSavedByEmail === "string"
        ? data.lastSavedByEmail
        : undefined,
    },
  };
}

async function createLinkedSharedRosterTransaction({
  transaction: tx,
  firestore,
  groupRef,
  requestRef,
  rosterRef,
  actor,
  input,
  nowIso,
  fieldValue,
  maxTransactionDocuments,
}) {
  const request = validateLinkedSharedRosterRequest(input);
  const actorUid = typeof actor?.uid === "string" ? actor.uid.trim() : "";
  if (!actorUid) fail("unauthenticated", "Sign in before creating a shared roster.");
  if (groupRef.id !== request.groupId) {
    fail("invalid-argument", "Choose a valid shared workspace.");
  }
  const expectedRequestDocumentId = creationRequestDocumentId({
    actorUid,
    groupId: request.groupId,
    creationRequestId: request.creationRequestId,
  });
  if (requestRef.id !== expectedRequestDocumentId) {
    fail("invalid-argument", "Choose a valid shared-roster creation request.");
  }
  cleanDocumentId(rosterRef.id, "shared roster");

  const groupSnap = await tx.get(groupRef);
  if (!groupSnap.exists) fail("not-found", "This shared workspace no longer exists.");
  const groupData = groupSnap.data() || {};
  if (!organizerUidsFromWorkspace(groupData).includes(actorUid)) {
    fail("permission-denied", "Only an active organizer can create a shared roster.");
  }

  const { rosterIds, rosterSnaps } = await preflightGroupRosterLinkage({
    transaction: tx,
    firestore,
    expectedGroupId: request.groupId,
    workspace: groupData,
    maxRosterCount: maxTransactionDocuments - 2,
    tooLargeMessage: "This workspace is too large for one roster-creation transaction.",
  });

  const actorEmail = normalizedEmail(
    resolveMemberEmailByUid(groupData, actorUid) || actor?.email,
  );
  if (!actorEmail.includes("@")) {
    fail("failed-precondition", "Your organizer membership has incomplete email data.");
  }

  const payloadFingerprint = creationPayloadFingerprint(request);
  const requestSnap = await tx.get(requestRef);
  if (requestSnap.exists) {
    const requestData = requestSnap.data() || {};
    if (requestData.schemaVersion !== 1
      || requestData.uid !== actorUid
      || requestData.groupId !== request.groupId
      || requestData.requestIdentityHash !== expectedRequestDocumentId
      || typeof requestData.rosterId !== "string") {
      fail("failed-precondition", "This shared-roster creation request is inconsistent.");
    }
    if (requestData.payloadFingerprint !== payloadFingerprint) {
      fail(
        "already-exists",
        "This shared-roster creation request was already used with different roster data.",
      );
    }
    const rosterIndex = rosterIds.indexOf(requestData.rosterId);
    if (rosterIndex < 0) {
      fail("failed-precondition", "This shared-roster creation request is inconsistent.");
    }
    const existingRoster = rosterSnaps[rosterIndex]?.data() || {};
    if (existingRoster.groupId !== request.groupId) {
      fail("failed-precondition", "This shared-roster creation request is inconsistent.");
    }
    return rosterResult(requestData.rosterId, existingRoster);
  }

  const memberUids = stringArray(groupData.memberUids);
  const memberEmails = stringArray(groupData.memberEmails);
  const pendingInviteEmails = stringArray(groupData.pendingInviteEmails);
  const groupName = cleanText(groupData.name, "My Stripes group", 120);
  const payload = {
    app: "Stripes",
    schemaVersion: 2,
    groupId: request.groupId,
    groupName,
    name: request.name,
    ownerUid: actorUid,
    ownerEmail: actorEmail,
    memberUids,
    memberEmails,
    pendingInviteEmails,
    memberNamesByUid: record(groupData.memberNamesByUid),
    memberNamesByEmail: record(groupData.memberNamesByEmail),
    memberUidByEmail: record(groupData.memberUidByEmail),
    roleByUid: record(groupData.roleByUid),
    version: 1,
    playerCount: request.rosterData.players.length,
    rosterData: request.rosterData,
    createdAt: fieldValue.serverTimestamp(),
    updatedAt: fieldValue.serverTimestamp(),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    lastSavedByUid: actorUid,
    lastSavedByEmail: actorEmail,
    lastSavedAt: fieldValue.serverTimestamp(),
    lastSavedAtIso: nowIso,
    backupHistory: [],
  };

  tx.create(rosterRef, payload);
  tx.create(requestRef, {
    schemaVersion: 1,
    uid: actorUid,
    groupId: request.groupId,
    requestIdentityHash: expectedRequestDocumentId,
    payloadFingerprint,
    rosterId: rosterRef.id,
    createdAt: fieldValue.serverTimestamp(),
    createdAtIso: nowIso,
  });
  tx.update(groupRef, {
    rosterIds: [...rosterIds, rosterRef.id],
    lastSavedByUid: actorUid,
    lastSavedByEmail: actorEmail,
    lastSavedRosterId: rosterRef.id,
    lastSavedRosterName: request.name,
    lastSavedAt: fieldValue.serverTimestamp(),
    lastSavedAtIso: nowIso,
    updatedAt: fieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
  });

  return rosterResult(rosterRef.id, payload);
}

module.exports = {
  creationPayloadFingerprint,
  creationRequestDocumentId,
  createLinkedSharedRosterTransaction,
  validateLinkedSharedRosterRequest,
  SharedRosterCreationError,
};

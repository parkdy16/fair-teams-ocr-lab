export type SharedRosterCreationAttempt = {
  schemaVersion: 1;
  uid: string;
  localRosterId: string;
  creationRequestId: string;
  groupId?: string;
  resultingRosterId?: string;
  createdAtIso: string;
};

type CreationAttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_PREFIX = "stripes-shared-roster-creation-attempt-v1";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

function cleanIdentity(value: string, label: string, maxLength = 300) {
  const cleaned = String(value || "").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return cleaned;
}

function cleanDocumentId(value: string, label: string) {
  const cleaned = cleanIdentity(value, label, 200);
  if (cleaned.includes("/")) throw new Error(`Choose a valid ${label}.`);
  return cleaned;
}

function storageKey(uid: string, localRosterId: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(uid)}:${encodeURIComponent(localRosterId)}`;
}

function browserStorage(): CreationAttemptStorage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("This browser cannot safely preserve a shared-roster creation attempt.");
  }
  return window.localStorage;
}

function newCreationRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("This browser cannot safely identify a shared-roster creation attempt.");
}

function parseAttempt(
  value: string | null,
  uid: string,
  localRosterId: string,
): SharedRosterCreationAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SharedRosterCreationAttempt>;
    if (parsed.schemaVersion !== 1
      || parsed.uid !== uid
      || parsed.localRosterId !== localRosterId
      || typeof parsed.creationRequestId !== "string"
      || !REQUEST_ID_PATTERN.test(parsed.creationRequestId)
      || typeof parsed.createdAtIso !== "string") {
      return null;
    }
    if (parsed.groupId !== undefined) cleanDocumentId(parsed.groupId, "shared workspace");
    if (parsed.resultingRosterId !== undefined) {
      cleanDocumentId(parsed.resultingRosterId, "shared roster");
    }
    return parsed as SharedRosterCreationAttempt;
  } catch {
    return null;
  }
}

function writeAttempt(storage: CreationAttemptStorage, attempt: SharedRosterCreationAttempt) {
  storage.setItem(
    storageKey(attempt.uid, attempt.localRosterId),
    JSON.stringify(attempt),
  );
  return attempt;
}

export function getOrCreateSharedRosterCreationAttempt(
  uidValue: string,
  localRosterIdValue: string,
  storage: CreationAttemptStorage = browserStorage(),
): SharedRosterCreationAttempt {
  const uid = cleanIdentity(uidValue, "signed-in account");
  const localRosterId = cleanIdentity(localRosterIdValue, "local roster");
  const key = storageKey(uid, localRosterId);
  const existing = parseAttempt(storage.getItem(key), uid, localRosterId);
  if (existing) return existing;

  const attempt: SharedRosterCreationAttempt = {
    schemaVersion: 1,
    uid,
    localRosterId,
    creationRequestId: newCreationRequestId(),
    createdAtIso: new Date().toISOString(),
  };
  return writeAttempt(storage, attempt);
}

export function bindSharedRosterCreationAttemptToGroup(
  attempt: SharedRosterCreationAttempt,
  groupIdValue: string,
  storage: CreationAttemptStorage = browserStorage(),
) {
  const groupId = cleanDocumentId(groupIdValue, "shared workspace");
  const current = parseAttempt(
    storage.getItem(storageKey(attempt.uid, attempt.localRosterId)),
    attempt.uid,
    attempt.localRosterId,
  );
  if (!current || current.creationRequestId !== attempt.creationRequestId) {
    throw new Error("The shared-roster creation attempt changed. Try again.");
  }
  if (current.groupId) return current;
  return writeAttempt(storage, { ...current, groupId });
}

export function recordSharedRosterCreationResult(
  attempt: SharedRosterCreationAttempt,
  rosterIdValue: string,
  storage: CreationAttemptStorage = browserStorage(),
) {
  const rosterId = cleanDocumentId(rosterIdValue, "shared roster");
  const current = parseAttempt(
    storage.getItem(storageKey(attempt.uid, attempt.localRosterId)),
    attempt.uid,
    attempt.localRosterId,
  );
  if (!current
    || current.creationRequestId !== attempt.creationRequestId
    || current.groupId !== attempt.groupId) {
    throw new Error("The shared-roster creation attempt changed. Try again.");
  }
  if (current.resultingRosterId && current.resultingRosterId !== rosterId) {
    throw new Error("The shared-roster creation attempt returned inconsistent results.");
  }
  return writeAttempt(storage, { ...current, resultingRosterId: rosterId });
}

export function adoptSharedRosterCreationResult(
  uidValue: string,
  localRosterIdValue: string,
  rosterIdValue: string,
  storage: CreationAttemptStorage = browserStorage(),
) {
  const uid = cleanIdentity(uidValue, "signed-in account");
  const localRosterId = cleanIdentity(localRosterIdValue, "local roster");
  const rosterId = cleanDocumentId(rosterIdValue, "shared roster");
  const key = storageKey(uid, localRosterId);
  const current = parseAttempt(storage.getItem(key), uid, localRosterId);
  if (!current || current.resultingRosterId !== rosterId) return false;
  storage.removeItem(key);
  return true;
}

export async function preserveCreatedRosterWhenRatingSeedFails<T extends object>(
  created: T,
  seedRatings: () => Promise<void>,
): Promise<T & { creationWarning?: string }> {
  try {
    await seedRatings();
    return created;
  } catch {
    return {
      ...created,
      creationWarning: "Initial Club ratings could not be saved. You can add them later.",
    };
  }
}

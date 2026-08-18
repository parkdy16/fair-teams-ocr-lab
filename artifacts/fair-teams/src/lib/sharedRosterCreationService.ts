import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFairTeamsAuth,
  getFairTeamsFirebaseApp,
} from "@/lib/firebaseClient";

export type CreateLinkedSharedRosterInput = {
  creationRequestId: string;
  groupId: string;
  name: string;
  rosterData: unknown;
};

export type CreatedLinkedSharedRoster = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  version: number;
  playerCount: number;
  createdAt?: string;
  updatedAt?: string;
  memberEmails: string[];
  pendingInviteEmails: string[];
  memberNamesByUid: Record<string, string>;
  memberNamesByEmail: Record<string, string>;
  memberUidByEmail: Record<string, string>;
  lastSavedByEmail?: string;
};

function functionsRegion() {
  return (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1").trim();
}

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), functionsRegion());
}

function cleanDocumentId(value: string, label: string) {
  const id = String(value || "").trim();
  if (!id || id.length > 200 || id.includes("/")) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return id;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function parseCreatedRoster(value: unknown): CreatedLinkedSharedRoster {
  if (!value || typeof value !== "object") {
    throw new Error("Stripes created the roster but returned an invalid response.");
  }
  const data = value as Record<string, unknown>;
  const id = cleanDocumentId(String(data.id || ""), "shared roster");
  const groupId = cleanDocumentId(String(data.groupId || ""), "shared workspace");
  const name = typeof data.name === "string" && data.name.trim()
    ? data.name.trim()
    : "Shared roster";
  return {
    id,
    groupId,
    groupName: typeof data.groupName === "string" && data.groupName.trim()
      ? data.groupName.trim()
      : "My Stripes group",
    name,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
    version: typeof data.version === "number" ? data.version : 1,
    playerCount: typeof data.playerCount === "number" ? data.playerCount : 0,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    memberEmails: stringArray(data.memberEmails),
    pendingInviteEmails: stringArray(data.pendingInviteEmails),
    memberNamesByUid: stringRecord(data.memberNamesByUid),
    memberNamesByEmail: stringRecord(data.memberNamesByEmail),
    memberUidByEmail: stringRecord(data.memberUidByEmail),
    lastSavedByEmail: typeof data.lastSavedByEmail === "string"
      ? data.lastSavedByEmail
      : undefined,
  };
}

export async function createLinkedSharedRoster(
  input: CreateLinkedSharedRosterInput,
): Promise<CreatedLinkedSharedRoster> {
  if (!getFairTeamsAuth().currentUser) {
    throw new Error("Sign in before creating a shared roster.");
  }
  const callable = httpsCallable<
    CreateLinkedSharedRosterInput,
    { ok: true; roster: unknown }
  >(functionsClient(), "createLinkedSharedRoster");
  const result = await callable({
    creationRequestId: input.creationRequestId,
    groupId: cleanDocumentId(input.groupId, "shared workspace"),
    name: input.name,
    rosterData: input.rosterData,
  });
  return parseCreatedRoster(result.data.roster);
}

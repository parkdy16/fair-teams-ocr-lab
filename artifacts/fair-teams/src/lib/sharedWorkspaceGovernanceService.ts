import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFairTeamsAuth,
  getFairTeamsFirebaseApp,
  getFairTeamsFirestore,
} from "@/lib/firebaseClient";

export type OrganizerRemovalProposalStatus = "open" | "passed" | "failed" | "cancelled";
export type OrganizerRemovalOutcomeReason =
  | "yes_threshold_reached"
  | "yes_threshold_unreachable"
  | "membership_changed";
export type OrganizerRemovalBallotChoice = "yes" | "no";

export type OrganizerRemovalProposal = {
  id: string;
  status: OrganizerRemovalProposalStatus;
  targetUid: string;
  targetDisplayNameSnapshot: string;
  totalOrganizerCount: number;
  eligibleGovernanceOrganizerCount: number;
  eligibleOrganizerCount: number;
  targetGovernanceEligible: boolean;
  requiredYes: number;
  yesCount: number | null;
  noCount: number | null;
  castCount: number;
  outcomeReason: OrganizerRemovalOutcomeReason | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
};

export type StartOrganizerRemovalProposalResult = {
  ok: true;
  proposalId: string;
  status: OrganizerRemovalProposalStatus;
  targetDisplayNameSnapshot: string;
  totalOrganizerCount: number;
  eligibleGovernanceOrganizerCount: number;
  eligibleOrganizerCount: number;
  targetGovernanceEligible: boolean;
  requiredYes: number;
  castCount: number;
  outcomeReason: OrganizerRemovalOutcomeReason | null;
};

export type CastOrganizerRemovalBallotResult = {
  ok: true;
  proposalId: string;
  status: OrganizerRemovalProposalStatus;
  castCount: number;
  requiredYes?: number;
  yesCount?: number | null;
  noCount?: number | null;
  outcomeReason: OrganizerRemovalOutcomeReason | null;
};

export type OrganizerRemovalParticipation = {
  proposalId: string;
  status: OrganizerRemovalProposalStatus;
  eligible: boolean;
  hasVoted: boolean;
};

const PROPOSAL_STATUSES = new Set<OrganizerRemovalProposalStatus>([
  "open",
  "passed",
  "failed",
  "cancelled",
]);
const OUTCOME_REASONS = new Set<OrganizerRemovalOutcomeReason>([
  "yes_threshold_reached",
  "yes_threshold_unreachable",
  "membership_changed",
]);

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user) throw new Error("Sign in before managing organizer removal.");
  return user;
}

function cleanDocumentId(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.includes("/") || cleaned.length > 200) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return cleaned;
}

function functionsRegion() {
  return (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1").trim();
}

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), functionsRegion());
}

function integer(value: unknown, minimum = 0) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : null;
}

function timestampToMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") return Number(toMillis.call(value)) || 0;
  }
  return 0;
}

function proposalStatus(value: unknown): OrganizerRemovalProposalStatus | null {
  return typeof value === "string" && PROPOSAL_STATUSES.has(value as OrganizerRemovalProposalStatus)
    ? value as OrganizerRemovalProposalStatus
    : null;
}

function outcomeReason(value: unknown): OrganizerRemovalOutcomeReason | null {
  return typeof value === "string" && OUTCOME_REASONS.has(value as OrganizerRemovalOutcomeReason)
    ? value as OrganizerRemovalOutcomeReason
    : null;
}

function parseProposal(id: string, data: DocumentData): OrganizerRemovalProposal | null {
  const status = proposalStatus(data.status);
  const targetUid = typeof data.targetUid === "string" ? data.targetUid : "";
  const totalOrganizerCount = integer(data.totalOrganizerCount, 2);
  const eligibleGovernanceOrganizerCount = integer(
    data.eligibleGovernanceOrganizerCount ?? data.totalOrganizerCount,
    2,
  );
  const eligibleOrganizerCount = integer(data.eligibleOrganizerCount, 1);
  const targetGovernanceEligible = typeof data.targetGovernanceEligible === "boolean"
    ? data.targetGovernanceEligible
    : true;
  const requiredYes = integer(data.requiredYes, 2);
  const castCount = integer(data.castCount);
  if (!status || !targetUid || totalOrganizerCount == null
    || eligibleGovernanceOrganizerCount == null || eligibleOrganizerCount == null
    || requiredYes == null || castCount == null) return null;
  if (eligibleGovernanceOrganizerCount !== totalOrganizerCount
    || eligibleOrganizerCount !== totalOrganizerCount - (targetGovernanceEligible ? 1 : 0)
    || requiredYes !== Math.floor(totalOrganizerCount / 2) + 1
    || castCount > eligibleOrganizerCount) return null;

  const isResolvedVote = status === "passed" || status === "failed";
  const parsedYesCount = isResolvedVote ? integer(data.yesCount) : null;
  const parsedNoCount = isResolvedVote ? integer(data.noCount) : null;
  if (isResolvedVote
    && (parsedYesCount == null || parsedNoCount == null || parsedYesCount + parsedNoCount !== castCount)) {
    return null;
  }

  const createdAt = timestampToMillis(data.createdAt) || timestampToMillis(data.createdAtIso);
  const updatedAt = timestampToMillis(data.updatedAt) || timestampToMillis(data.updatedAtIso) || createdAt;
  const closedAt = timestampToMillis(data.closedAt) || timestampToMillis(data.closedAtIso) || null;
  const parsedOutcomeReason = outcomeReason(data.outcomeReason);
  if ((status === "open" && parsedOutcomeReason != null)
    || (status === "passed" && parsedOutcomeReason !== "yes_threshold_reached")
    || (status === "failed" && parsedOutcomeReason !== "yes_threshold_unreachable")
    || (status === "cancelled" && parsedOutcomeReason !== "membership_changed")
    || (status !== "open" && closedAt == null)) return null;
  return {
    id,
    status,
    targetUid,
    targetDisplayNameSnapshot: typeof data.targetDisplayNameSnapshot === "string" && data.targetDisplayNameSnapshot.trim()
      ? data.targetDisplayNameSnapshot.trim()
      : "Organizer",
    totalOrganizerCount,
    eligibleGovernanceOrganizerCount,
    eligibleOrganizerCount,
    targetGovernanceEligible,
    requiredYes,
    yesCount: parsedYesCount,
    noCount: parsedNoCount,
    castCount,
    outcomeReason: parsedOutcomeReason,
    createdAt,
    updatedAt,
    closedAt,
  };
}

function proposalCollection(groupId: string) {
  return collection(
    getFairTeamsFirestore(),
    "sharedGroups",
    cleanDocumentId(groupId, "shared workspace"),
    "organizerRemovalProposals",
  );
}

export function listenToOrganizerRemovalProposals(
  groupId: string,
  callback: (proposals: OrganizerRemovalProposal[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  return onSnapshot(
    proposalCollection(groupId),
    (snapshot) => {
      const proposals = snapshot.docs
        .map((proposalDoc) => parseProposal(proposalDoc.id, proposalDoc.data()))
        .filter((proposal): proposal is OrganizerRemovalProposal => Boolean(proposal))
        .sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt);
      callback(proposals);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load organizer-removal votes.")),
  );
}

export function listenToOrganizerRemovalProposal(
  groupId: string,
  proposalId: string,
  callback: (proposal: OrganizerRemovalProposal | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  requireSignedInUser();
  const proposalRef = doc(
    proposalCollection(groupId),
    cleanDocumentId(proposalId, "organizer-removal vote"),
  );
  return onSnapshot(
    proposalRef,
    (snapshot) => callback(snapshot.exists() ? parseProposal(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error instanceof Error ? error : new Error("Could not load the organizer-removal vote.")),
  );
}

export async function startOrganizerRemovalProposal(groupId: string, targetEmail: string) {
  requireSignedInUser();
  const normalizedEmail = targetEmail.trim().toLowerCase();
  if (!normalizedEmail.includes("@") || normalizedEmail.length > 320) {
    throw new Error("Choose a valid organizer.");
  }
  const callable = httpsCallable<
    { groupId: string; targetEmail: string },
    StartOrganizerRemovalProposalResult
  >(functionsClient(), "startOrganizerRemovalProposal");
  const result = await callable({
    groupId: cleanDocumentId(groupId, "shared workspace"),
    targetEmail: normalizedEmail,
  });
  return result.data;
}

export async function getOrganizerRemovalParticipation(groupId: string, proposalId: string) {
  requireSignedInUser();
  const callable = httpsCallable<
    { groupId: string; proposalId: string },
    OrganizerRemovalParticipation
  >(functionsClient(), "getOrganizerRemovalState");
  const result = await callable({
    groupId: cleanDocumentId(groupId, "shared workspace"),
    proposalId: cleanDocumentId(proposalId, "organizer-removal vote"),
  });
  return result.data;
}

export async function castOrganizerRemovalBallot(
  groupId: string,
  proposalId: string,
  choice: OrganizerRemovalBallotChoice,
) {
  requireSignedInUser();
  if (choice !== "yes" && choice !== "no") throw new Error("Choose Yes or No.");
  const callable = httpsCallable<
    { groupId: string; proposalId: string; choice: OrganizerRemovalBallotChoice },
    CastOrganizerRemovalBallotResult
  >(functionsClient(), "castOrganizerRemovalBallot");
  const result = await callable({
    groupId: cleanDocumentId(groupId, "shared workspace"),
    proposalId: cleanDocumentId(proposalId, "organizer-removal vote"),
    choice,
  });
  return result.data;
}

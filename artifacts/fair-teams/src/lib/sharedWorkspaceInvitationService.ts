import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFairTeamsAuth,
  getFairTeamsFirebaseApp,
} from "@/lib/firebaseClient";

export type WorkspaceInvitationState = "pending" | "expired" | "cancelled" | "accepted";
export type WorkspaceInvitationDeliveryStatus = "not_sent" | "sending" | "sent" | "failed";

export type WorkspaceOrganizerInvitation = {
  invitationId: string | null;
  invitedEmail: string;
  state: WorkspaceInvitationState;
  expiresAt: string | null;
  deliveryStatus: WorkspaceInvitationDeliveryStatus;
  lastSentAt: string | null;
  resendAvailableAt: string | null;
};

export type WorkspaceInvitationContext = {
  workspaceName: string;
  inviterDisplayName: string;
  state: WorkspaceInvitationState;
  expiresAt: string;
  maskedInvitedEmail: string;
};

export type CreateWorkspaceOrganizerInvitationResult = {
  ok: true;
  reused: boolean;
  emailSent: boolean;
  invitation: WorkspaceOrganizerInvitation;
};

export type ResendWorkspaceOrganizerInvitationResult = {
  ok: true;
  emailSent: boolean;
  invitation: WorkspaceOrganizerInvitation;
};

const INVITATION_STATES = new Set<WorkspaceInvitationState>([
  "pending",
  "expired",
  "cancelled",
  "accepted",
]);
const DELIVERY_STATUSES = new Set<WorkspaceInvitationDeliveryStatus>([
  "not_sent",
  "sending",
  "sent",
  "failed",
]);

function requireSignedInUser() {
  const user = getFairTeamsAuth().currentUser;
  if (!user) throw new Error("Sign in before managing organizer invitations.");
  return user;
}

function cleanDocumentId(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.includes("/") || cleaned.length > 200) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return cleaned;
}

function cleanEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 320) {
    throw new Error("Enter a valid email address to invite.");
  }
  return email;
}

function functionsRegion() {
  return (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1").trim();
}

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), functionsRegion());
}

function optionalIso(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function invitationState(value: unknown): WorkspaceInvitationState {
  return typeof value === "string" && INVITATION_STATES.has(value as WorkspaceInvitationState)
    ? value as WorkspaceInvitationState
    : "pending";
}

function deliveryStatus(value: unknown): WorkspaceInvitationDeliveryStatus {
  return typeof value === "string" && DELIVERY_STATUSES.has(value as WorkspaceInvitationDeliveryStatus)
    ? value as WorkspaceInvitationDeliveryStatus
    : "not_sent";
}

function parseOrganizerInvitation(value: unknown): WorkspaceOrganizerInvitation {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const invitedEmail = typeof data.invitedEmail === "string" ? data.invitedEmail.trim().toLowerCase() : "";
  if (!invitedEmail.includes("@")) throw new Error("Stripes returned invalid invitation data.");
  return {
    invitationId: typeof data.invitationId === "string" && data.invitationId.trim()
      ? data.invitationId.trim()
      : null,
    invitedEmail,
    state: invitationState(data.state),
    expiresAt: optionalIso(data.expiresAt),
    deliveryStatus: deliveryStatus(data.deliveryStatus),
    lastSentAt: optionalIso(data.lastSentAt),
    resendAvailableAt: optionalIso(data.resendAvailableAt),
  };
}

export async function createWorkspaceOrganizerInvitation(
  groupId: string,
  invitedEmail: string,
): Promise<CreateWorkspaceOrganizerInvitationResult> {
  requireSignedInUser();
  const callable = httpsCallable<
    { groupId: string; invitedEmail: string },
    Omit<CreateWorkspaceOrganizerInvitationResult, "invitation"> & { invitation: unknown }
  >(functionsClient(), "createWorkspaceOrganizerInvitation");
  const result = await callable({
    groupId: cleanDocumentId(groupId, "shared workspace"),
    invitedEmail: cleanEmail(invitedEmail),
  });
  return { ...result.data, invitation: parseOrganizerInvitation(result.data.invitation) };
}

export async function resendWorkspaceOrganizerInvitation(
  invitationId: string,
): Promise<ResendWorkspaceOrganizerInvitationResult> {
  requireSignedInUser();
  const callable = httpsCallable<
    { invitationId: string },
    Omit<ResendWorkspaceOrganizerInvitationResult, "invitation"> & { invitation: unknown }
  >(functionsClient(), "resendWorkspaceOrganizerInvitation");
  const result = await callable({ invitationId: cleanDocumentId(invitationId, "invitation") });
  return { ...result.data, invitation: parseOrganizerInvitation(result.data.invitation) };
}

export async function cancelWorkspaceOrganizerInvitation(
  groupId: string,
  invitation: Pick<WorkspaceOrganizerInvitation, "invitationId" | "invitedEmail">,
): Promise<void> {
  requireSignedInUser();
  const callable = httpsCallable<
    { groupId: string; invitationId?: string; invitedEmail: string },
    { ok: true }
  >(functionsClient(), "cancelWorkspaceOrganizerInvitation");
  await callable({
    groupId: cleanDocumentId(groupId, "shared workspace"),
    ...(invitation.invitationId
      ? { invitationId: cleanDocumentId(invitation.invitationId, "invitation") }
      : {}),
    invitedEmail: cleanEmail(invitation.invitedEmail),
  });
}

export async function listWorkspaceOrganizerInvitations(
  groupId: string,
): Promise<WorkspaceOrganizerInvitation[]> {
  requireSignedInUser();
  const callable = httpsCallable<
    { groupId: string },
    { invitations: unknown[] }
  >(functionsClient(), "listWorkspaceOrganizerInvitations");
  const result = await callable({ groupId: cleanDocumentId(groupId, "shared workspace") });
  return Array.isArray(result.data.invitations)
    ? result.data.invitations.map(parseOrganizerInvitation)
    : [];
}

export async function getWorkspaceOrganizerInvitationContext(
  invitationId: string,
): Promise<WorkspaceInvitationContext> {
  const callable = httpsCallable<
    { invitationId: string },
    WorkspaceInvitationContext
  >(functionsClient(), "getWorkspaceOrganizerInvitationContext");
  const result = await callable({ invitationId: cleanDocumentId(invitationId, "invitation") });
  return {
    workspaceName: String(result.data.workspaceName || "Stripes workspace").trim(),
    inviterDisplayName: String(result.data.inviterDisplayName || "An organizer").trim(),
    state: invitationState(result.data.state),
    expiresAt: optionalIso(result.data.expiresAt) || new Date(0).toISOString(),
    maskedInvitedEmail: String(result.data.maskedInvitedEmail || "***").trim(),
  };
}

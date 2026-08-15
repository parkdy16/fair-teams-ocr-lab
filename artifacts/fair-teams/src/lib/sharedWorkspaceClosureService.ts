import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFairTeamsAuth,
  getFairTeamsFirebaseApp,
} from "@/lib/firebaseClient";
export { workspaceClosureConfirmationMatches } from "@/lib/sharedWorkspaceClosure";

export type SharedWorkspaceClosureState = {
  workspaceKind: "group" | "roster";
  workspaceId: string;
  workspaceName: string;
  groupId: string | null;
  rosterId: string;
  organizerCount: number;
  isLastOrganizer: boolean;
  canClose: boolean;
  cleanupPending: boolean;
};

export type CloseSharedWorkspaceResult = {
  ok: true;
  workspaceName: string;
  groupId: string | null;
  rosterIds: string[];
};

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), "europe-west1");
}

function cleanDocumentId(value: string, label: string) {
  const id = String(value || "").trim();
  if (!id || id.includes("/") || id.length > 200) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return id;
}

function requireSignedInUser() {
  if (!getFairTeamsAuth().currentUser) throw new Error("Sign in first.");
}

function parseClosureState(value: unknown): SharedWorkspaceClosureState {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const workspaceKind = data.workspaceKind === "group" || data.workspaceKind === "roster"
    ? data.workspaceKind
    : null;
  const organizerCount = Number(data.organizerCount);
  if (!workspaceKind || !Number.isInteger(organizerCount) || organizerCount < 1) {
    throw new Error("Stripes received invalid workspace closure status.");
  }
  return {
    workspaceKind,
    workspaceId: cleanDocumentId(String(data.workspaceId || ""), "shared workspace"),
    workspaceName: String(data.workspaceName || "Stripes workspace").trim() || "Stripes workspace",
    groupId: typeof data.groupId === "string" && data.groupId.trim() ? data.groupId.trim() : null,
    rosterId: cleanDocumentId(String(data.rosterId || ""), "shared roster"),
    organizerCount,
    isLastOrganizer: data.isLastOrganizer === true,
    canClose: data.canClose === true,
    cleanupPending: data.cleanupPending === true,
  };
}

export async function getSharedWorkspaceClosureState(
  rosterId: string,
): Promise<SharedWorkspaceClosureState> {
  requireSignedInUser();
  const callable = httpsCallable<{ rosterId: string }, unknown>(
    functionsClient(),
    "getSharedWorkspaceClosureState",
  );
  const result = await callable({ rosterId: cleanDocumentId(rosterId, "shared roster") });
  return parseClosureState(result.data);
}

export async function closeSharedWorkspace(
  state: SharedWorkspaceClosureState,
  confirmationName: string,
): Promise<CloseSharedWorkspaceResult> {
  requireSignedInUser();
  const callable = httpsCallable<
    {
      rosterId: string;
      workspaceKind: "group" | "roster";
      workspaceId: string;
      confirmationName: string;
    },
    CloseSharedWorkspaceResult
  >(functionsClient(), "closeSharedWorkspace");
  const result = await callable({
    rosterId: cleanDocumentId(state.rosterId, "shared roster"),
    workspaceKind: state.workspaceKind,
    workspaceId: cleanDocumentId(state.workspaceId, "shared workspace"),
    confirmationName,
  });
  return {
    ok: true,
    workspaceName: String(result.data.workspaceName || state.workspaceName).trim() || state.workspaceName,
    groupId: typeof result.data.groupId === "string" && result.data.groupId.trim()
      ? result.data.groupId.trim()
      : null,
    rosterIds: Array.from(new Set(
      (Array.isArray(result.data.rosterIds) ? result.data.rosterIds : [])
        .map((id) => cleanDocumentId(String(id), "shared roster")),
    )),
  };
}

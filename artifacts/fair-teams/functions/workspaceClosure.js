"use strict";

const crypto = require("crypto");
const { organizerUidsFromWorkspace } = require("./organizerRemoval");

class WorkspaceClosureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceClosureError";
    this.code = code;
  }
}

function cleanId(value, label) {
  const id = String(value || "").trim();
  if (!id || id.includes("/") || id.length > 200) {
    throw new WorkspaceClosureError("invalid-argument", `Choose a valid ${label}.`);
  }
  return id;
}

function normalizedConfirmation(value) {
  return String(value || "").trim();
}

function workspaceClosureId(workspaceKind, workspaceId) {
  if (workspaceKind !== "group" && workspaceKind !== "roster") {
    throw new WorkspaceClosureError("invalid-argument", "Choose a valid shared workspace type.");
  }
  const id = cleanId(workspaceId, "shared workspace");
  return crypto.createHash("sha256").update(`${workspaceKind}:${id}`).digest("hex");
}

function workspaceClosureState({ actorUid, workspace, workspaceName }) {
  const uid = String(actorUid || "").trim();
  if (!uid) throw new WorkspaceClosureError("unauthenticated", "Sign in first.");
  const organizerUids = organizerUidsFromWorkspace(workspace);
  if (!organizerUids.includes(uid)) {
    throw new WorkspaceClosureError("permission-denied", "Only an active organizer can manage workspace closure.");
  }
  const organizerCount = organizerUids.length;
  return {
    workspaceName: String(workspaceName || "Stripes workspace").trim() || "Stripes workspace",
    organizerCount,
    isLastOrganizer: organizerCount === 1,
    canClose: organizerCount === 1,
    cleanupPending: false,
  };
}

function resumableWorkspaceClosure({ actorUid, rosterId, checkpoints }) {
  const uid = String(actorUid || "").trim();
  if (!uid) throw new WorkspaceClosureError("unauthenticated", "Sign in first.");
  const requestedRosterId = cleanId(rosterId, "shared roster");
  const matches = (Array.isArray(checkpoints) ? checkpoints : []).filter((checkpoint) => {
    const data = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
    const rosterIds = Array.isArray(data.rosterIds) ? data.rosterIds : [];
    return data.closedByUid === uid
      && (data.cleanupStatus === "pending" || data.cleanupStatus === "failed")
      && rosterIds.includes(requestedRosterId);
  });
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new WorkspaceClosureError(
      "failed-precondition",
      "Stripes found conflicting workspace cleanup records.",
    );
  }

  const checkpoint = matches[0];
  const workspaceKind = checkpoint.workspaceKind;
  if (workspaceKind !== "group" && workspaceKind !== "roster") {
    throw new WorkspaceClosureError("failed-precondition", "This workspace cleanup record is invalid.");
  }
  const workspaceId = cleanId(checkpoint.workspaceId, "shared workspace");
  const originalRosterId = cleanId(checkpoint.rosterId, "shared roster");
  const groupId = checkpoint.groupId ? cleanId(checkpoint.groupId, "shared workspace") : null;
  if ((workspaceKind === "group" && groupId !== workspaceId)
    || (workspaceKind === "roster" && (groupId || workspaceId !== originalRosterId))) {
    throw new WorkspaceClosureError("failed-precondition", "This workspace cleanup record is invalid.");
  }

  return {
    workspaceKind,
    workspaceId,
    workspaceName: String(checkpoint.workspaceName || "Stripes workspace").trim() || "Stripes workspace",
    groupId,
    rosterId: originalRosterId,
    organizerCount: 1,
    isLastOrganizer: true,
    canClose: true,
    cleanupPending: true,
  };
}

function validateWorkspaceClosure({ actorUid, workspace, workspaceName, confirmationName }) {
  const state = workspaceClosureState({ actorUid, workspace, workspaceName });
  if (!state.canClose) {
    throw new WorkspaceClosureError(
      "failed-precondition",
      "This workspace can be closed only when one active organizer remains.",
    );
  }
  if (!normalizedConfirmation(confirmationName)
    || normalizedConfirmation(confirmationName) !== normalizedConfirmation(state.workspaceName)) {
    throw new WorkspaceClosureError(
      "failed-precondition",
      "Type the workspace name exactly to confirm closure.",
    );
  }
  return state;
}

function workspaceClosureCleanupTargets({ groupId, rosterIds }) {
  const cleanGroupId = groupId ? cleanId(groupId, "shared workspace") : null;
  const cleanRosterIds = Array.from(new Set((Array.isArray(rosterIds) ? rosterIds : [])
    .map((id) => cleanId(id, "shared roster"))));
  return {
    firestoreRoots: [
      ...(cleanGroupId ? [{ kind: "group", id: cleanGroupId }] : []),
      ...cleanRosterIds.map((id) => ({ kind: "roster", id })),
    ],
    notificationScopes: [
      ...(cleanGroupId ? [{ kind: "group", id: cleanGroupId }] : []),
      ...cleanRosterIds.map((id) => ({ kind: "roster", id })),
    ],
    storagePrefixes: cleanRosterIds.map((id) => `sharedRosters/${id}/resources/`),
    deleteInvitationStateForGroupId: cleanGroupId,
  };
}

module.exports = {
  WorkspaceClosureError,
  normalizedConfirmation,
  resumableWorkspaceClosure,
  validateWorkspaceClosure,
  workspaceClosureCleanupTargets,
  workspaceClosureId,
  workspaceClosureState,
};

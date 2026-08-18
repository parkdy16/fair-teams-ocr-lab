"use strict";

class WorkspaceRosterLinkageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceRosterLinkageError";
    this.code = code;
  }
}

const INCONSISTENT_LINKAGE_MESSAGE =
  "This workspace has inconsistent linked-roster data. No changes were made.";

function inconsistentLinkageError() {
  return new WorkspaceRosterLinkageError(
    "failed-precondition",
    INCONSISTENT_LINKAGE_MESSAGE,
  );
}

function groupRosterIds(workspace) {
  const data = workspace && typeof workspace === "object" ? workspace : {};
  if (!Object.prototype.hasOwnProperty.call(data, "rosterIds")
    || data.rosterIds === undefined) {
    return [];
  }
  if (!Array.isArray(data.rosterIds)) throw inconsistentLinkageError();

  const rosterIds = data.rosterIds.map((rosterId) => {
    if (typeof rosterId !== "string") throw inconsistentLinkageError();
    const trimmed = rosterId.trim();
    if (!trimmed
      || trimmed !== rosterId
      || trimmed.length > 200
      || trimmed.includes("/")) {
      throw inconsistentLinkageError();
    }
    return trimmed;
  });
  return Array.from(new Set(rosterIds));
}

async function preflightGroupRosterLinkage({
  transaction,
  firestore,
  expectedGroupId,
  workspace,
  maxRosterCount = Number.POSITIVE_INFINITY,
  tooLargeMessage = "This workspace is too large for one transaction.",
}) {
  const rosterIds = groupRosterIds(workspace);
  if (rosterIds.length > maxRosterCount) {
    throw new WorkspaceRosterLinkageError("resource-exhausted", tooLargeMessage);
  }

  const rosterRefs = rosterIds.map((rosterId) => (
    firestore.collection("sharedRosters").doc(rosterId)
  ));
  const rosterSnaps = rosterRefs.length ? await transaction.getAll(...rosterRefs) : [];

  if (rosterSnaps.length !== rosterRefs.length) {
    throw inconsistentLinkageError();
  }

  const linkedRosters = rosterSnaps.map((rosterSnap) => {
    if (!rosterSnap.exists) throw inconsistentLinkageError();
    const roster = rosterSnap.data() || {};
    if (roster.groupId !== expectedGroupId) throw inconsistentLinkageError();
    return roster;
  });

  return {
    rosterIds,
    rosterRefs,
    rosterSnaps,
    linkedRosters,
  };
}

module.exports = {
  groupRosterIds,
  preflightGroupRosterLinkage,
  WorkspaceRosterLinkageError,
};

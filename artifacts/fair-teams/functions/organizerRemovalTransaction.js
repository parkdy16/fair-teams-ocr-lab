"use strict";

const {
  evaluateOrganizerRemovalVote,
  organizerGovernanceEligibility,
  organizerMembershipFingerprint,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  resolveMemberEmailByUid,
} = require("./organizerRemoval");
const { preflightGroupRosterLinkage } = require("./workspaceRosterLinkage");

class OrganizerRemovalTransactionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrganizerRemovalTransactionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new OrganizerRemovalTransactionError(code, message);
}

async function castOrganizerRemovalBallotTransaction({
  transaction: tx,
  firestore: db,
  refs,
  actorUid,
  groupId,
  proposalId,
  choice,
  nowMillis,
  nowIso,
  maxTransactionDocuments,
  fieldValue,
}) {
  const {
    groupRef,
    proposalRef,
    privateRef,
    controlRef,
    ballotRef,
  } = refs;
  const [groupSnap, proposalSnap, privateSnap, controlSnap, ballotSnap] = await tx.getAll(
    groupRef,
    proposalRef,
    privateRef,
    controlRef,
    ballotRef,
  );
  if (!groupSnap.exists) fail("not-found", "This shared workspace no longer exists.");
  if (!proposalSnap.exists) fail("not-found", "This organizer-removal vote no longer exists.");

  const proposalData = proposalSnap.data() || {};
  if (proposalData.status !== "open") {
    fail("failed-precondition", "This organizer-removal vote is already closed.");
  }
  if (!privateSnap.exists
    || !controlSnap.exists
    || controlSnap.data()?.activeProposalId !== proposalId) {
    fail("failed-precondition", "This organizer-removal vote is not active.");
  }

  const groupData = groupSnap.data() || {};
  const privateData = privateSnap.data() || {};
  const currentOrganizerUids = organizerUidsFromWorkspace(groupData);
  if (!currentOrganizerUids.includes(actorUid)) {
    fail("permission-denied", "Only an active organizer can vote.");
  }
  if (!organizerGovernanceEligibility(groupData, actorUid, nowMillis).eligible) {
    fail(
      "permission-denied",
      "Protected organizer-removal voting is not available to this organizer yet.",
    );
  }

  const votedUids = Array.from(new Set(
    (Array.isArray(privateData.votedUids) ? privateData.votedUids : [])
      .filter((uid) => typeof uid === "string" && uid.length > 0),
  ));
  const frozenGovernanceUids = Array.from(new Set(
    (Array.isArray(privateData.governanceEligibleOrganizerUids)
      ? privateData.governanceEligibleOrganizerUids
      : privateData.organizerUids || [])
      .filter((uid) => typeof uid === "string" && uid.length > 0),
  ));
  const frozenTargetUid = String(privateData.targetUid || "");
  const currentRelevantUids = Array.from(new Set([
    frozenTargetUid,
    ...frozenGovernanceUids,
  ])).filter((uid) => currentOrganizerUids.includes(uid));
  const currentMembershipFingerprint = organizerMembershipFingerprint(currentRelevantUids);

  const {
    rosterRefs: linkedRosterRefs,
    linkedRosters,
  } = await preflightGroupRosterLinkage({
    transaction: tx,
    firestore: db,
    expectedGroupId: groupId,
    workspace: groupData,
    maxRosterCount: maxTransactionDocuments - votedUids.length - 5,
    tooLargeMessage: "This workspace is too large for one protected removal transaction.",
  });

  if (privateData.membershipFingerprint !== currentMembershipFingerprint) {
    tx.update(proposalRef, {
      status: "cancelled",
      yesCount: null,
      noCount: null,
      castCount: Number.isInteger(privateData.castCount) ? privateData.castCount : 0,
      outcomeReason: "membership_changed",
      closedAt: fieldValue.serverTimestamp(),
      closedAtIso: nowIso,
      updatedAt: fieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    votedUids.forEach((voterUid) => {
      tx.delete(privateRef.collection("ballots").doc(voterUid));
    });
    tx.delete(privateRef);
    tx.delete(controlRef);
    return {
      ok: true,
      proposalId,
      status: "cancelled",
      castCount: Number.isInteger(privateData.castCount) ? privateData.castCount : 0,
      outcomeReason: "membership_changed",
    };
  }

  const targetUid = String(privateData.targetUid || "");
  const eligibleVoterUids = Array.isArray(privateData.eligibleVoterUids)
    ? privateData.eligibleVoterUids.filter((uid) => typeof uid === "string" && uid.length > 0)
    : [];
  if (!targetUid || targetUid !== proposalData.targetUid) {
    fail("failed-precondition", "This organizer-removal vote has invalid target data.");
  }
  const targetGovernanceEligible = frozenGovernanceUids.includes(targetUid);
  const expectedEligibleVoterUids = frozenGovernanceUids.filter((uid) => uid !== targetUid);
  if (Number(proposalData.totalOrganizerCount) !== frozenGovernanceUids.length
    || Number(proposalData.eligibleOrganizerCount) !== expectedEligibleVoterUids.length
    || Boolean(proposalData.targetGovernanceEligible ?? true) !== targetGovernanceEligible
    || eligibleVoterUids.length !== expectedEligibleVoterUids.length
    || eligibleVoterUids.some((uid) => !expectedEligibleVoterUids.includes(uid))) {
    fail("failed-precondition", "This organizer-removal vote has invalid electorate data.");
  }
  if (actorUid === targetUid || !eligibleVoterUids.includes(actorUid)) {
    fail("permission-denied", "You are not eligible to vote on this proposal.");
  }
  if (ballotSnap.exists || votedUids.includes(actorUid)) {
    fail("failed-precondition", "Your ballot has already been recorded.");
  }

  const nextYesCount = Number(privateData.yesCount || 0) + (choice === "yes" ? 1 : 0);
  const nextNoCount = Number(privateData.noCount || 0) + (choice === "no" ? 1 : 0);
  const result = evaluateOrganizerRemovalVote({
    totalOrganizerCount: Number(proposalData.totalOrganizerCount),
    eligibleOrganizerCount: eligibleVoterUids.length,
    yesCount: nextYesCount,
    noCount: nextNoCount,
  });
  const nextVotedUids = [...votedUids, actorUid];

  if (result.status === "open") {
    tx.create(ballotRef, {
      choice,
      castAt: fieldValue.serverTimestamp(),
      castAtIso: nowIso,
    });
    tx.update(privateRef, {
      yesCount: result.yesCount,
      noCount: result.noCount,
      castCount: result.castCount,
      votedUids: nextVotedUids,
      updatedAt: fieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
    tx.update(proposalRef, {
      castCount: result.castCount,
      updatedAt: fieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });
  } else {
    tx.update(proposalRef, {
      status: result.status,
      yesCount: result.yesCount,
      noCount: result.noCount,
      castCount: result.castCount,
      outcomeReason: result.outcomeReason,
      closedAt: fieldValue.serverTimestamp(),
      closedAtIso: nowIso,
      updatedAt: fieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    });

    if (result.status === "passed") {
      const targetEmail = resolveMemberEmailByUid(groupData, targetUid);
      if (!targetEmail || !targetEmail.includes("@")) {
        fail("failed-precondition", "The target organizer has an incomplete membership record.");
      }
      tx.update(groupRef, {
        ...removeOrganizerMembership(groupData, targetUid, targetEmail),
        updatedAt: fieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      });
      linkedRosters.forEach((rosterData, index) => {
        const rosterTargetEmail = resolveMemberEmailByUid(rosterData, targetUid) || targetEmail;
        tx.update(linkedRosterRefs[index], {
          ...removeOrganizerMembership(rosterData, targetUid, rosterTargetEmail),
          updatedAt: fieldValue.serverTimestamp(),
          updatedAtIso: nowIso,
        });
      });
    }

    votedUids.forEach((voterUid) => {
      tx.delete(privateRef.collection("ballots").doc(voterUid));
    });
    tx.delete(privateRef);
    tx.delete(controlRef);
  }

  return {
    ok: true,
    proposalId,
    status: result.status,
    castCount: result.castCount,
    requiredYes: result.requiredYes,
    yesCount: result.status === "open" ? null : result.yesCount,
    noCount: result.status === "open" ? null : result.noCount,
    outcomeReason: result.outcomeReason,
  };
}

module.exports = {
  castOrganizerRemovalBallotTransaction,
  OrganizerRemovalTransactionError,
};

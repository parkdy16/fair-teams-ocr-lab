"use strict";

const crypto = require("node:crypto");

const ORGANIZER_ROLES = new Set(["owner", "editor", "organizer"]);
const GOVERNANCE_ELIGIBILITY_DELAY_MS = 14 * 24 * 60 * 60 * 1000;

function requireInteger(value, name, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function organizerUidsFromWorkspace(data) {
  const workspace = data && typeof data === "object" ? data : {};
  const memberUids = Array.isArray(workspace.memberUids)
    ? Array.from(new Set(workspace.memberUids.filter((uid) => typeof uid === "string" && uid.length > 0)))
    : [];
  const roleByUid = workspace.roleByUid && typeof workspace.roleByUid === "object"
    ? workspace.roleByUid
    : {};
  const legacyOwnerUid = typeof workspace.ownerUid === "string" ? workspace.ownerUid : "";

  return memberUids.filter((uid) => {
    const role = roleByUid[uid];
    if (ORGANIZER_ROLES.has(role)) return true;
    return uid === legacyOwnerUid && role == null;
  }).sort();
}

function timestampMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && typeof value.toMillis === "function") {
    const parsed = Number(value.toMillis());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function organizerGovernanceEligibility(workspace, uid, nowMillis = Date.now()) {
  const organizerUids = organizerUidsFromWorkspace(workspace);
  if (!organizerUids.includes(uid)) {
    return { eligible: false, eligibleAtMillis: 0, legacy: false };
  }

  const eligibilityByUid = workspace?.organizerGovernanceEligibleAtByUid;
  const hasEligibilityRecord = Boolean(
    eligibilityByUid
    && typeof eligibilityByUid === "object"
    && Object.prototype.hasOwnProperty.call(eligibilityByUid, uid),
  );
  if (!hasEligibilityRecord) {
    return { eligible: true, eligibleAtMillis: 0, legacy: true };
  }

  const eligibleAtMillis = timestampMillis(eligibilityByUid[uid]);
  return {
    eligible: eligibleAtMillis > 0 && nowMillis >= eligibleAtMillis,
    eligibleAtMillis,
    legacy: false,
  };
}

function governanceEligibleOrganizerUids(workspace, nowMillis = Date.now()) {
  return organizerUidsFromWorkspace(workspace)
    .filter((uid) => organizerGovernanceEligibility(workspace, uid, nowMillis).eligible);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveMemberUidByEmail(data, email) {
  const workspace = data && typeof data === "object" ? data : {};
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) return "";

  const memberUidByEmail = workspace.memberUidByEmail && typeof workspace.memberUidByEmail === "object"
    ? workspace.memberUidByEmail
    : {};
  for (const [candidateEmail, candidateUid] of Object.entries(memberUidByEmail)) {
    if (cleanEmail(candidateEmail) === normalizedEmail && typeof candidateUid === "string") {
      return candidateUid;
    }
  }

  const memberEmails = Array.isArray(workspace.memberEmails) ? workspace.memberEmails.map(cleanEmail) : [];
  const memberUids = Array.isArray(workspace.memberUids) ? workspace.memberUids : [];
  const fallbackIndex = memberEmails.indexOf(normalizedEmail);
  return fallbackIndex >= 0 && typeof memberUids[fallbackIndex] === "string"
    ? memberUids[fallbackIndex]
    : "";
}

function resolveMemberEmailByUid(data, uid) {
  const workspace = data && typeof data === "object" ? data : {};
  if (typeof uid !== "string" || !uid) return "";

  const memberUidByEmail = workspace.memberUidByEmail && typeof workspace.memberUidByEmail === "object"
    ? workspace.memberUidByEmail
    : {};
  for (const [candidateEmail, candidateUid] of Object.entries(memberUidByEmail)) {
    if (candidateUid === uid) return cleanEmail(candidateEmail);
  }

  const memberUids = Array.isArray(workspace.memberUids) ? workspace.memberUids : [];
  const memberEmails = Array.isArray(workspace.memberEmails) ? workspace.memberEmails : [];
  const fallbackIndex = memberUids.indexOf(uid);
  if (fallbackIndex >= 0) {
    const fallbackEmail = cleanEmail(memberEmails[fallbackIndex]);
    if (fallbackEmail) return fallbackEmail;
  }

  if (workspace.ownerUid === uid) return cleanEmail(workspace.ownerEmail);
  return "";
}

function activeWorkspaceNotificationRecipients(data) {
  const workspace = data && typeof data === "object" ? data : {};
  const organizerUids = new Set(organizerUidsFromWorkspace(workspace));
  const memberEmails = Array.isArray(workspace.memberEmails) ? workspace.memberEmails : [];
  const recipients = new Map();

  memberEmails.forEach((candidateEmail) => {
    const email = cleanEmail(candidateEmail);
    if (!email.includes("@") || recipients.has(email)) return;
    const uid = resolveMemberUidByEmail(workspace, email);
    if (!uid || !organizerUids.has(uid)) return;
    recipients.set(email, { email, uid });
  });

  return Array.from(recipients.values());
}

function removeRecordKey(value, key) {
  const record = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(record).filter(([candidateKey]) => candidateKey !== key));
}

function removeEmailKeys(value, email, targetUid = "") {
  const normalizedEmail = cleanEmail(email);
  const record = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(record).filter(([candidateEmail, candidateValue]) => (
    (!normalizedEmail || cleanEmail(candidateEmail) !== normalizedEmail)
    && (!targetUid || candidateValue !== targetUid)
  )));
}

function removeOrganizerMembership(data, targetUid, targetEmail) {
  const workspace = data && typeof data === "object" ? data : {};
  const normalizedEmail = cleanEmail(targetEmail);
  const updates = {
    memberUids: (Array.isArray(workspace.memberUids) ? workspace.memberUids : [])
      .filter((uid) => uid !== targetUid),
    memberEmails: (Array.isArray(workspace.memberEmails) ? workspace.memberEmails : [])
      .filter((email) => cleanEmail(email) !== normalizedEmail),
    pendingInviteEmails: (Array.isArray(workspace.pendingInviteEmails) ? workspace.pendingInviteEmails : [])
      .filter((email) => cleanEmail(email) !== normalizedEmail),
    roleByUid: removeRecordKey(workspace.roleByUid, targetUid),
    memberNamesByUid: removeRecordKey(workspace.memberNamesByUid, targetUid),
    memberNamesByEmail: removeEmailKeys(workspace.memberNamesByEmail, normalizedEmail),
    memberUidByEmail: removeEmailKeys(workspace.memberUidByEmail, normalizedEmail, targetUid),
  };
  if (workspace.organizerJoinedAtByUid && typeof workspace.organizerJoinedAtByUid === "object") {
    updates.organizerJoinedAtByUid = removeRecordKey(workspace.organizerJoinedAtByUid, targetUid);
  }
  if (workspace.organizerGovernanceEligibleAtByUid
    && typeof workspace.organizerGovernanceEligibleAtByUid === "object") {
    updates.organizerGovernanceEligibleAtByUid = removeRecordKey(
      workspace.organizerGovernanceEligibleAtByUid,
      targetUid,
    );
  }
  return updates;
}

function memberDisplayName(data, uid, email) {
  const workspace = data && typeof data === "object" ? data : {};
  const normalizedEmail = cleanEmail(email);
  const namesByUid = workspace.memberNamesByUid && typeof workspace.memberNamesByUid === "object"
    ? workspace.memberNamesByUid
    : {};
  const namesByEmail = workspace.memberNamesByEmail && typeof workspace.memberNamesByEmail === "object"
    ? workspace.memberNamesByEmail
    : {};
  const uidName = typeof namesByUid[uid] === "string" ? namesByUid[uid].trim() : "";
  if (uidName) return uidName.slice(0, 80);

  for (const [candidateEmail, candidateName] of Object.entries(namesByEmail)) {
    if (cleanEmail(candidateEmail) === normalizedEmail && typeof candidateName === "string" && candidateName.trim()) {
      return candidateName.trim().slice(0, 80);
    }
  }

  const emailPrefix = normalizedEmail.split("@")[0].trim();
  return emailPrefix.slice(0, 80) || "Organizer";
}

function organizerMembershipFingerprint(organizerUids) {
  const normalizedUids = Array.from(new Set(
    (Array.isArray(organizerUids) ? organizerUids : [])
      .filter((uid) => typeof uid === "string" && uid.length > 0),
  )).sort();
  return crypto.createHash("sha256").update(normalizedUids.join("\n"), "utf8").digest("hex");
}

function requiredYesVotes(totalOrganizerCount) {
  const total = requireInteger(totalOrganizerCount, "totalOrganizerCount", 2);
  return Math.floor(total / 2) + 1;
}

function buildOrganizerRemovalElectorate(workspace, targetUid, nowMillis = Date.now()) {
  if (typeof targetUid !== "string" || !targetUid) {
    throw new TypeError("targetUid must be a non-empty string.");
  }

  const organizerUids = organizerUidsFromWorkspace(workspace);
  if (!organizerUids.includes(targetUid)) {
    throw new RangeError("The proposal target must be an active organizer.");
  }
  const governanceEligibleUids = governanceEligibleOrganizerUids(workspace, nowMillis);
  if (governanceEligibleUids.length < 2) {
    throw new RangeError(
      "An organizer-removal proposal requires at least two governance-eligible organizers.",
    );
  }
  const targetGovernanceEligible = governanceEligibleUids.includes(targetUid);
  const eligibleVoterUids = governanceEligibleUids.filter((uid) => uid !== targetUid);

  return {
    organizerUids,
    governanceEligibleOrganizerUids: governanceEligibleUids,
    eligibleVoterUids,
    targetGovernanceEligible,
    totalOrganizerCount: governanceEligibleUids.length,
    eligibleGovernanceOrganizerCount: governanceEligibleUids.length,
    eligibleOrganizerCount: eligibleVoterUids.length,
    requiredYes: requiredYesVotes(governanceEligibleUids.length),
  };
}

function evaluateOrganizerRemovalVote({
  totalOrganizerCount,
  eligibleOrganizerCount,
  yesCount,
  noCount,
}) {
  const total = requireInteger(totalOrganizerCount, "totalOrganizerCount", 2);
  const yes = requireInteger(yesCount, "yesCount");
  const no = requireInteger(noCount, "noCount");
  const eligible = eligibleOrganizerCount == null
    ? total - 1
    : requireInteger(eligibleOrganizerCount, "eligibleOrganizerCount");
  if (eligible > total) {
    throw new RangeError("eligibleOrganizerCount cannot exceed totalOrganizerCount.");
  }
  const castCount = yes + no;

  if (castCount > eligible) {
    throw new RangeError("yesCount plus noCount cannot exceed the eligible organizer count.");
  }

  const requiredYes = requiredYesVotes(total);
  const remainingCount = eligible - castCount;
  let status = "open";
  let outcomeReason = null;

  if (yes >= requiredYes) {
    status = "passed";
    outcomeReason = "yes_threshold_reached";
  } else if (yes + remainingCount < requiredYes) {
    status = "failed";
    outcomeReason = "yes_threshold_unreachable";
  }

  return {
    status,
    outcomeReason,
    totalOrganizerCount: total,
    eligibleOrganizerCount: eligible,
    requiredYes,
    yesCount: yes,
    noCount: no,
    castCount,
    remainingCount,
  };
}

module.exports = {
  activeWorkspaceNotificationRecipients,
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  GOVERNANCE_ELIGIBILITY_DELAY_MS,
  governanceEligibleOrganizerUids,
  memberDisplayName,
  organizerMembershipFingerprint,
  organizerGovernanceEligibility,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  requiredYesVotes,
  resolveMemberEmailByUid,
  resolveMemberUidByEmail,
};

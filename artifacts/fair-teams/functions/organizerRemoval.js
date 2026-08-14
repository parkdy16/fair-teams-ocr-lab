"use strict";

const crypto = require("node:crypto");

const ORGANIZER_ROLES = new Set(["owner", "editor", "organizer"]);

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
  return {
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

function buildOrganizerRemovalElectorate(workspace, targetUid) {
  if (typeof targetUid !== "string" || !targetUid) {
    throw new TypeError("targetUid must be a non-empty string.");
  }

  const organizerUids = organizerUidsFromWorkspace(workspace);
  if (organizerUids.length < 2) {
    throw new RangeError("An organizer-removal proposal requires at least two organizers.");
  }
  if (!organizerUids.includes(targetUid)) {
    throw new RangeError("The proposal target must be an active organizer.");
  }

  return {
    organizerUids,
    eligibleVoterUids: organizerUids.filter((uid) => uid !== targetUid),
    totalOrganizerCount: organizerUids.length,
    eligibleOrganizerCount: organizerUids.length - 1,
    requiredYes: requiredYesVotes(organizerUids.length),
  };
}

function evaluateOrganizerRemovalVote({ totalOrganizerCount, yesCount, noCount }) {
  const total = requireInteger(totalOrganizerCount, "totalOrganizerCount", 2);
  const yes = requireInteger(yesCount, "yesCount");
  const no = requireInteger(noCount, "noCount");
  const eligibleOrganizerCount = total - 1;
  const castCount = yes + no;

  if (castCount > eligibleOrganizerCount) {
    throw new RangeError("yesCount plus noCount cannot exceed the eligible organizer count.");
  }

  const requiredYes = requiredYesVotes(total);
  const remainingCount = eligibleOrganizerCount - castCount;
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
    eligibleOrganizerCount,
    requiredYes,
    yesCount: yes,
    noCount: no,
    castCount,
    remainingCount,
  };
}

module.exports = {
  buildOrganizerRemovalElectorate,
  evaluateOrganizerRemovalVote,
  memberDisplayName,
  organizerMembershipFingerprint,
  organizerUidsFromWorkspace,
  removeOrganizerMembership,
  requiredYesVotes,
  resolveMemberEmailByUid,
  resolveMemberUidByEmail,
};

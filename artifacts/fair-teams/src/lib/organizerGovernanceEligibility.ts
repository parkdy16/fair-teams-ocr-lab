export type OrganizerGovernanceEligibilityState = {
  eligible: boolean;
  eligibleAt: number | null;
  legacy: boolean;
};

export function organizerGovernanceEligibilityState(
  eligibilityByUid: Record<string, string> | undefined,
  uid: string | undefined,
  nowMillis = Date.now(),
): OrganizerGovernanceEligibilityState {
  if (!uid) return { eligible: false, eligibleAt: null, legacy: false };
  if (!eligibilityByUid || !Object.prototype.hasOwnProperty.call(eligibilityByUid, uid)) {
    return { eligible: true, eligibleAt: null, legacy: true };
  }

  const eligibleAt = Date.parse(eligibilityByUid[uid] || "");
  if (!Number.isFinite(eligibleAt)) {
    return { eligible: false, eligibleAt: null, legacy: false };
  }
  return {
    eligible: nowMillis >= eligibleAt,
    eligibleAt,
    legacy: false,
  };
}

export function governanceEligibilityDateLabel(eligibleAt: number, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(new Date(eligibleAt));
}

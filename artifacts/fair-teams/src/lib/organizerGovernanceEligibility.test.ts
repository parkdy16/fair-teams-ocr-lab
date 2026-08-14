import assert from "node:assert/strict";
import test from "node:test";
import {
  governanceEligibilityDateLabel,
  organizerGovernanceEligibilityState,
} from "./organizerGovernanceEligibility.ts";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const ELIGIBLE_AT = new Date(NOW + 14 * 24 * 60 * 60 * 1000).toISOString();

test("legacy organizers without timing metadata remain governance eligible", () => {
  assert.deepEqual(organizerGovernanceEligibilityState({}, "legacy", NOW), {
    eligible: true,
    eligibleAt: null,
    legacy: true,
  });
});

test("a newly accepted organizer is gated until the server eligibility time", () => {
  const eligibility = { newcomer: ELIGIBLE_AT };
  assert.equal(organizerGovernanceEligibilityState(eligibility, "newcomer", NOW).eligible, false);
  assert.equal(
    organizerGovernanceEligibilityState(eligibility, "newcomer", Date.parse(ELIGIBLE_AT)).eligible,
    true,
  );
});

test("malformed explicit timing fails closed instead of becoming legacy eligibility", () => {
  assert.deepEqual(organizerGovernanceEligibilityState({ newcomer: "invalid" }, "newcomer", NOW), {
    eligible: false,
    eligibleAt: null,
    legacy: false,
  });
});

test("the compact eligibility label contains the activation day", () => {
  assert.equal(governanceEligibilityDateLabel(Date.parse(ELIGIBLE_AT), "en-US"), "Aug 28");
});

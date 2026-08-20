# Team Engine — H3 Safety Baseline and Pure Experiments

## 1) Current Legacy Engine Behavior

The current local team generator lives in `src/lib/teamGenerator.ts` and is intentionally legacy behavior.

Current behavior includes:
- weighted radar-attribute strength using `getWeightedSkill()`,
- field-size-dependent profiles (`small`, `medium`, `large`) in that weighting,
- special-ability stat boosts via `getSpecialSkillStatBoosts()`,
- `todayStatus === "not_here_yet"` discount in `getBalanceSkill()`,
- female/running heuristics before general distribution,
- greedy assignment to the currently lowest total (`assignToLowest*`),
- pairing-rule post-pass optimization (`improvePairingRules()`),
- optional random perturbation (`shuffleEquals`) only as non-semantic tie/noise,
- no explicit goalkeeper/position constraints,
- no disruption-cost model for existing teams,
- no explicit historical-strength disadvantage coefficients beyond current `getWeightedSkill` + field-size weights.

## 2) H3 Golden Safety Invariants

H3-B adds regression tests around invariant properties only (no product behavior redesign).

Protected today:
1. every selected/input player appears exactly once,
2. no duplicate assignment,
3. no selected/input player disappears,
4. no unexpected player is introduced,
5. requested team count is respected,
6. 10 players / 2 teams coverage and near-even split,
7. 12 players / 2 teams coverage and near-even split,
8. odd rosters (9 and 11 players) preserve complete membership,
9. all-equal attribute pool remains stable and complete,
10. extreme-strength / outlier pools remain complete,
11. deterministic no-shuffle behavior for identical deterministic input,
12. shuffle mode preserves membership invariants,
13. feasible `keep-together` constraints are honored,
14. feasible `keep-separate` constraints are honored,
15. malformed pairing rules fail safely via current cleaning behavior,
16. manual helper recomputation (`recomputeStats`) preserves membership and deterministic aggregates,
17. invalid generation inputs return empty team arrays.

A deterministic characterization scenario is now recorded for a 9-player 2-team 4v5 split to track current output shape/strength behavior and to keep future changes honest.

## 3) H3-C Experimental Evaluator Terminology

H3-C adds a pure experiment-only evaluator in
`src/lib/experiments/teamFairnessExperiment.ts`. It is imported only by its
focused test harness and is not connected to `teamGenerator.ts`, UI state,
persistence or Firebase.

The evaluator uses these terms:

- **raw OVR total**: the sum of independent `overallSkill` ratings assigned to
  one team;
- **OVR average per player**: raw OVR total divided by assigned roster size;
- **active/on-field player count**: the number playing at once, reported
  separately from assigned roster size;
- **profile composition**: per-profile totals and cross-team spreads for any
  supplied absolute profile values;
- **effective strength**: raw OVR total plus the result of an explicit,
  replaceable numerical-advantage policy;
- **assignment disruption**: existing players whose current team ID differs
  from a supplied previous assignment.

No combined fairness score is produced. Raw OVR, averages, active counts,
profile composition, hard-constraint violations, disruption and effective
strength difference remain separate outputs.

## 4) Explicit Experimental Match Format

Each candidate describes:

- a candidate ID and number of teams;
- assigned player IDs for every team;
- active/on-field player count for every team;
- either fixed on-field assignments or equal on-field counts with rotating
  substitutes;
- optional previous team assignments for disruption measurement.

The pure evaluator rejects missing, duplicate or unknown player assignments and
inconsistent match-format descriptions instead of producing misleading metrics.

## 5) Replaceable Numerical-Advantage Policy

The harness includes a parameterized example policy that adds an experimental
amount for each extra active player only in fixed-on-field formats. It applies
no unequal-count adjustment to equal 5v5 or to equal 4v4 on-field play where one
roster has a rotating substitute.

This seam exists to sweep assumptions, not to select or recommend a production
coefficient. Numerical-advantage behavior belongs to a sport/match policy, not
to generic player ratings. A future sport may replace the example policy
without changing OVR or profile data.

## 6) Raw OVR and Profile Composition

OVR is an independent holistic strength rating. It is not derived from profile
averages. Optional profile values remain absolute ratings used to describe team
composition separately.

The future football profile vocabulary is Attack, Defense, Passing, Stamina,
Technique and Pace. Other sports may define different profile or trait
vocabularies. Team Play is not part of future numeric fairness, while Special
Abilities and Player Vibe remain cosmetic only; their current UI is outside H3-C.

The focused profile fixture holds every player's OVR at 6. One arrangement has
identical team OVR totals but Attack/Defense total spreads of 28; another keeps
the same OVR totals and reduces both profile spreads to 0. H3-C deliberately
does not decide how profile composition should trade against OVR balance.

## 7) Live Split Preparation

When previous assignments are present, the evaluator reports comparable
existing players, changed-player count and changed player IDs. New arrivals are
not counted as disruptions because they had no previous assignment. H3-C only
measures disruption; it does not optimize Live Split.

## 8) T1 Future Fairness Model (documented, not frozen)

Planned T1 directions are intentionally decoupled and should not be inferred from current assertions:
- Overall strength anchor shifts to OVR.
- profile dimensions become compositional controls, not hidden legacy coupling.
- Special Ability / vibe remains cosmetic and non-algorithmic.
- explicit multi-sport attributes and role-aware fairness are introduced deliberately in T1.
- goalkeeper/role coverage and explicit continuity/disruption cost (Live Split) are future model features.

## 9) Unresolved Calibration Questions

- permanent 4v5 substitute disadvantage compensation: current generator does not model an explicit numerical penalty/credit,
- equal-on-field substitution semantics: whether future balancing should target raw active field strength versus roster-total strength,
- whether and how to carry organizer-defined tactical priorities into a future evaluator,
- whether repeat-pairing history should become an explicit cost term,
- how to keep current behavior-compatible during migration from legacy field-size weighting.
- what numerical-advantage policy each sport and match format should use, if any,
- what parameter range and resolution humans should inspect before any production proposal,
- whether future active-strength evaluation needs explicit identities/rotation time rather than active counts alone,
- how profile, constraints and disruption should participate in candidate selection without becoming an unexplained aggregate score.

## 10) Why these are not production exact-match tests

The H3-B suite intentionally avoids hard-coding exact production team
compositions or claiming the current output is fair. H3-C does assert exact
synthetic experiment results so parameter-sweep changes remain reproducible,
but none of those assignments or coefficients define production fairness.

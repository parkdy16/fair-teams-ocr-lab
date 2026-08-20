# Team Engine — H3 Golden Safety Baseline

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

## 3) T1 Future Fairness Model (documented, not frozen)

Planned T1 directions are intentionally decoupled and should not be inferred from current assertions:
- Overall strength anchor shifts to OVR.
- profile dimensions become compositional controls, not hidden legacy coupling.
- Special Ability / vibe remains cosmetic and non-algorithmic.
- explicit multi-sport attributes and role-aware fairness are introduced deliberately in T1.
- goalkeeper/role coverage and explicit continuity/disruption cost (Live Split) are future model features.

## 4) Unresolved Calibration Questions

- permanent 4v5 substitute disadvantage compensation: current generator does not model an explicit numerical penalty/credit,
- equal-on-field substitution semantics: whether future balancing should target raw active field strength versus roster-total strength,
- whether and how to carry organizer-defined tactical priorities into a future evaluator,
- whether repeat-pairing history should become an explicit cost term,
- how to keep current behavior-compatible during migration from legacy field-size weighting.

## 5) Why these are not exact-match tests

The suite intentionally avoids hard-coding exact team compositions or claiming the current output is fair. It records current measurable surface behavior and prevents regression in safety semantics.

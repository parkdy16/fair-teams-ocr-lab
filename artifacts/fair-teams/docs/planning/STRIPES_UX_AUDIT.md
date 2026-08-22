# Stripes Visual UX Audit

Status: **production audit infrastructure adopted**

Production branch: `main`
Canonical production roadmap: `STRIPES_ROADMAP.md`

The experimental `experiment/joongpt-prototype` branch remains a separate
source of candidate product ideas. Its UI is not merged wholesale into
production.

## Purpose

The visual UX audit captures the real Stripes application in deterministic
states before another large design patch is written. It is intended to stop the
team from discovering hierarchy, styling and interaction problems only after
implementation.

The audit is evidence, not an automatic redesign. AI suggestions, human review
and phone testing still decide what survives.

## Adoption contract

The audit system itself is now permanent Stripes production infrastructure.

Product changes still require deliberate adoption:

1. Capture the current production app before major UX/UI work.
2. Audit screenshots, accessibility snapshots, browser traces and metrics.
3. When comparing experimental ideas, classify them as **Keep**, **Change** or
   **Remove**.
4. Approve the intended interaction and visual hierarchy before coding.
5. Reconcile approved product decisions into canonical `STRIPES_ROADMAP.md`.
6. Implement the production-quality version through the normal `main` workflow
   and engineering gates.
7. Rerun the visual audit plus regression and real-device verification.

The experimental branch is never merged wholesale merely because a prototype
looks useful. Proven product decisions may be adopted while prototype-only code
is rewritten or discarded.

## What the audit captures

The production baseline currently covers:

- workspace chooser;
- populated Roster overview;
- Roster Settings;
- Add Player choices;
- manual Add Player form;
- existing Player Setup;
- Player Setup with Advanced Edit open;
- Teams setup;
- generated teams;
- empty roster;
- long-content stress state;
- signed-out shared workspace.

Each state is captured at:

- `390 × 844` compact phone;
- `430 × 932` larger phone;
- `768 × 1024` tablet;
- `1440 × 900` desktop.

The validated baseline is therefore **12 scenarios × 4 viewports = 48
captures**.

Every capture contains:

- viewport screenshot;
- ARIA accessibility snapshot;
- Playwright interaction trace;
- visual metrics and interactive-element inventory;
- console/page diagnostics;
- blocked unexpected external requests.

Additional temporary scenarios may be added when evaluating major new flows,
then promoted into the permanent baseline when they represent durable product
states.

## Run the audit

From the repository root:

```bash
pnpm --dir artifacts/fair-teams run audit:ux
```

The generated evidence appears at:

```text
artifacts/fair-teams/ux-audit-results/index.html
```

Open `index.html` in a browser to view the contact sheet. The generated folder is
ignored by Git.

To package the evidence for review from Git Bash:

```bash
tar -a -c -f "$HOME/Desktop/Stripes-UX-Audit.zip" -C artifacts/fair-teams ux-audit-results
```

## Review rubric

Stripes should feel:

- fast;
- approachable;
- tactile;
- social;
- confidently simple;
- slightly playful;
- memorable through useful interaction rather than decoration.

Stripes should not feel:

- childish or arcade-like;
- corporate-SaaS-heavy;
- tactically overcomplicated;
- visually noisy;
- postal-themed;
- assembled from unrelated component-library examples.

Prioritize:

1. clarity of the next action;
2. speed for recurring organizers;
3. optional complexity remaining visibly optional;
4. one-handed mobile usability;
5. consistency across related flows;
6. restrained personality;
7. visual hierarchy, spacing and typography;
8. safe save/destructive behavior;
9. responsive integrity;
10. accessibility.

## Required finding format

Every finding should record:

- exact scenario and viewport;
- exact element or interaction;
- severity: blocker, friction, inconsistency or polish;
- category: UX, art direction, accessibility or implementation artifact;
- user consequence;
- minimal correction;
- stronger redesign alternative;
- confidence: high, medium or low.

## Experimental hypotheses awaiting evidence review

These are hypotheses from phone testing, not pre-decided conclusions:

| Area | Hypothesis |
|---|---|
| New roster | The current scrollable setup plus nested Player Model modal is too cryptic. |
| Custom activity icon | The joystick suggests video gaming rather than a broad sport/game/activity. |
| Attribute setup | Raw 3/6 configuration does not explain the outcome in user language. |
| Roster hierarchy | Player Model is too prominent for an infrequent setup task. |
| Rating | The separate batch-rating modal duplicates the mature Player Setup experience. |
| Edge selector | The useful interaction should live inside the Skill/OVR shell. |
| Radar feedback | Preset selection needs immediate visible profile feedback. |
| Batch progression | Swipe should save safely and move to the next unrated player. |
| Visual identity | The multicolor rail currently reads as postal rather than distinctly Stripes. |
| Settings | Preset import/export/Drive management may be too prominent in normal editing. |

## Decision record

Populate this after reviewing the generated evidence.

| Experimental item | Decision | Evidence | Production adoption note |
|---|---|---|---|
| Independent OVR and profile shape | Pending | | |
| Roster-owned attributes and presets | Pending | | |
| Guided new-roster setup | Pending | | |
| Player Model placement | Pending | | |
| Separate batch-rating UI | Pending | | |
| Edge preset selector | Pending | | |
| Immediate radar feedback | Pending | | |
| Swipe save-and-next | Pending | | |
| Preset management and sharing | Pending | | |
| Community-compatible packs | Pending | | |

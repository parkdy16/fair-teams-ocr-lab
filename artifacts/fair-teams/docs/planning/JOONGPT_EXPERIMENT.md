# JoonGPT Player Model + Rating Experiment

Status: **EXPERIMENTAL BRANCH ONLY**

Branch: `experiment/joongpt-prototype`

This document records a disposable product experiment. It does not supersede
`STRIPES_ROADMAP.md`, authorize a production migration, or change the canonical
launch plan. Accepted findings are reconciled into the canonical roadmap only
after real-device testing and an explicit product decision.

## Product hypothesis

Stripes should make player rating feel complete after one judgment and smarter
after one optional gesture:

**OVR -> optional standout preset -> explicit Next**

The normal flow should remain usable with one hand and should be easier to
understand than the previous Defense-to-Attack slider. The detailed player
model should be powerful enough to improve future team composition without
turning routine roster setup into scouting homework.

## Findings from Prototype A phone testing

The first deployed rating prototype established the following product findings:

- The OVR-first card flow feels better than the previous style slider.
- Presets must be visibly optional. The first large central `What stands out?`
  control incorrectly made them feel mandatory.
- `All-rounder` is unnecessary. No selected preset already means that nothing
  particular has been recorded as standing out at that OVR.
- A selected preset must be removable by selecting it again.
- Selecting a preset must not immediately advance to the next player. The user
  needs a chance to review, switch, clear, or fine-tune it.
- A literal operating-system screen-edge gesture risks browser/back-gesture
  conflict. The preferred interaction is a visible Stripes rail inset into the
  player card edge.
- High OVR must not produce an almost full radar. OVR answers **how good**;
  detailed attributes answer **how that ability is expressed**.
- Physical/Strength is not the intended future Football dimension. The current
  storage slot may remain as a compatibility seam, but the user-facing semantic
  replacement is Technique.

## A.2 player model under test

### Independent OVR

OVR is an organizer-authored holistic strength judgment and the current
competitive-strength guardrail.

- Editing detailed profile values does not silently recalculate OVR.
- Changing OVR does not flatten a manually refined detailed profile.
- A high-OVR player may still have an obvious weak detailed dimension.
- The current mature generator uses independent OVR as the strength input for
  these new profiles. Detailed composition remains prepared data for the later
  structured evaluator; this experiment is not Generate v2.

### Roster-owned attributes

Each roster owns one player-model definition. The experimental supported
profile shapes are deliberately limited to:

- 3 attributes — triangle;
- 6 attributes — hexagon.

The default Football six are:

1. Goal Threat
2. Creation
3. Stamina
4. Defense
5. Technique
6. Pace

The legacy `physical` storage field temporarily carries the Technique value so
this experiment can remain compatible with the mature persistence and
shared-rating seams without a broad backend migration.

Attributes may be customized while creating a roster. Changing an attribute's
meaning removes the existing preset library so no saved shape can silently
describe the wrong dimensions; the organizer then creates or imports presets for
the new model. Switching to the three-attribute Football shape keeps only Goal Threat,
Playmaker, and Defender as representable starter presets. Once the roster
contains players, semantic attribute editing is locked. Applying a genuinely
different model to an existing local roster requires an explicit rating reset
while retaining player identity. A shared-roster destructive reset is
intentionally not implemented in this experiment because it needs an
organizer-safe trusted backend decision and private-rating cleanup contract.

### Presets

A preset is a reusable profile shape over the roster's exact attribute model.
It is not a cosmetic label, a collectible badge, or another independent set of
player statistics.

- A roster may contain many available presets.
- A player may select zero, one primary, or one primary plus one secondary
  preset in this experiment.
- Selecting a selected preset again clears it.
- A third selection is rejected rather than silently flattening the profile.
- The first preset has 65% and the second 35% influence when blended.
- Preset offsets are centered over the active attributes so a preset changes
  shape rather than adding hidden strength.
- Applying a preset copies the resulting detailed values to the player.
- Later edits to the library preset do not retroactively change already-rated
  players.
- Replacing a manually fine-tuned profile requires confirmation.

The default Football preset library deliberately contains several immediately
recognizable choices and no `All-rounder`:

- Goal Threat
- Finisher
- Playmaker
- Technician
- Dribbler
- Space Finder
- Defender
- Ball Winner
- Fast
- High Energy

These names and shapes remain experimental. Real-player testing should judge
whether every option is immediately understood and whether any choices overlap
too heavily.

## Locked rating interaction being tested

### Mobile and tablet

- Rating opens a full-screen stack of player cards.
- The current card emphasizes player identity and a large OVR control.
- OVR-only is a complete rating and the normal explicit `Next` action remains
  available without interacting with presets.
- A visible Stripes rail sits inside the right edge of the player card.
- Pulling the rail inward reveals the roster's preset library.
- Sliding vertically highlights a preset; releasing toggles it.
- A small conventional `Add standout` action opens the same library for users
  who do not use the gesture.
- Selected presets use the visual language of the existing Special Traits
  chips, but their new meaning is algorithmic profile seeding.
- Selecting a preset does not auto-save or auto-advance.
- The organizer can clear, switch, add a secondary preset, open Advanced Edit,
  or press Next.
- The card then deals away and reveals the next player.
- Previous restores the prior card and its values.
- Reduced-motion and tap-only alternatives remain available.

### Desktop

Desktop uses the same OVR, preset, and Advanced Edit concepts with
pointer/keyboard-friendly controls. It must not require simulated phone
swiping.

## B.1 custom roster setup under test

The next prototype consolidates new-roster creation into one dedicated setup
surface. The previous inline name field plus separate Player Model button made
custom setup easy to miss and encouraged users to create the roster before
understanding the model choice.

The contained setup now offers three explicit starting points:

- **Football** — the Stripes six-attribute model and starter preset library;
- **Custom sport or game** — an OVR-ready three-attribute model with no presets;
- **Use a preset pack** — imports a self-contained attribute model and selected
  presets before creating the roster.

OVR-only remains complete in every mode. A custom roster may be created before
its placeholder attributes are renamed, but the interface clearly explains that
meaningful attributes are required before Advanced Edit or presets become
useful. Until then, batch rating, add-player and edit-player surfaces stay
OVR-only instead of exposing meaningless Attribute 1/2/3 controls. Local
OVR-only players do not prematurely lock attribute editing; attributes lock only
after a player receives a model-bound preset or fine-tuned profile. Shared
rosters remain conservative because private organizer profiles may already exist
outside the canonical player payload.

The setup remains one contained modal rather than a wizard. The user can name
the roster, choose a starting model, review the model summary, open the dedicated
Player Model editor when desired, and create the roster. Preset creation now
validates a recognizable unique name and a non-flat profile shape.

## Dedicated Player Model settings

The experiment adds a separate Player Model modal rather than requiring a fake
player to create reusable presets.

### Attributes

- Choose 3 or 6 during roster creation.
- Edit each attribute name and explanation.
- Attribute slots and stable IDs bind presets and detailed player values.
- Existing rosters with players cannot casually reinterpret those meanings.

### Preset Library

- Create a preset.
- Edit name and short description.
- Choose a stable icon from the curated Stripes/Lucide library.
- Shape the preset using one relative bar per current roster attribute.
- See a live radar preview.
- Save, duplicate, reorder, select, or delete presets.
- Deleting a preset does not rewrite already-copied player detailed values.

The editor normalizes saved offsets around the current model so moving every
bar upward cannot secretly create a stronger player. OVR remains the strength
judgment.

## Portable preset packs

A self-contained `.stripes-presets.json` pack contains:

- pack/schema version;
- the complete 3- or 6-attribute model;
- stable attribute IDs, meanings, slots, and order;
- only the selected presets;
- preset names, descriptions, stable icon keys, and relative shapes;
- no player names, ratings, attendance, identities, or club data.

The Settings library supports:

- select a few presets;
- select all presets;
- export the selected collection as one file;
- save the same file to the connected user's Google Drive using the existing
  memory-only `drive.file` connection;
- import a pack.

For a matching attribute model, imported presets receive new IDs and name
conflicts become `(1)`, `(2)`, and so on. Nothing is silently overwritten.

For an incompatible model:

- roster creation may adopt the imported model;
- an existing local roster may explicitly replace the model and reset rating
  data while keeping players;
- an existing shared roster is refused in this experiment pending an approved
  trusted shared reset flow.

This pack is the intended future community-sharing boundary. A community pack
would be copied into a roster; it would never remain live-linked to its author.
No stripes.work publishing, discovery, likes, moderation, or marketplace
backend is included here.

## Shared-roster and privacy boundary

The roster's player-model definition and preset library are shared workspace
configuration and participate in shared autosync material identity.

Individual detailed profile observations remain private organizer ratings.
The shared canonical player payload continues to publish the mature neutral
profile shape rather than one organizer's private detailed assessment.

No Firestore rules, callable Functions, authentication, governance, or Google
scope changes are part of this patch.

## Intentionally untouched systems

- Firebase Authentication and account linking
- Firestore and Storage security rules
- shared-workspace authority and governance
- invitation and workspace-closure flows
- File Cabinet architecture and Google OAuth scopes
- final structured evaluator / Generate v2
- Live Split optimizer
- community website backend
- canonical roadmap sequencing

## Required repository verification

```text
npm run typecheck:live
npm run check:i18n
npm run check:architecture
npm run test:core-regression
npm run test:browser-smoke
git diff --check HEAD
```

The experiment also adds focused tests for:

- deterministic default player-model normalization;
- 3- and 6-attribute models;
- high-OVR asymmetric preset profiles;
- preset centering and two-preset blending;
- independent OVR generator behavior;
- pack selection/import compatibility and conflict-safe naming;
- local player reset preserving identity;
- shared autosync including the model while excluding private detailed
  observations.

## Real-device verification

- Rate at least 20 players in one session.
- Confirm OVR-only feels complete and does not invite unnecessary preset work.
- Test every default preset at OVR 3, 6, and 9.
- Confirm high-OVR preset radars retain meaningful weaknesses.
- Select, switch, and re-tap to clear presets.
- Try primary plus secondary presets and confirm a third is refused clearly.
- Fine-tune a preset profile, then attempt replacement and verify confirmation.
- Test Previous, Skip, close/reopen, and explicit Next.
- Test the inset rail with right thumb, tap-only controls, Android back gesture,
  scrolling, bright outdoor conditions, and reduced motion.
- Create, edit, duplicate, reorder, and delete custom presets.
- Export a selected subset and all presets.
- Import into a matching model and verify conflict-safe duplicate names.
- Save a pack to Google Drive and verify it creates a separate JSON file without
  changing Cabinet or roster backup behavior.
- Test a new custom three-attribute roster.
- Test an incompatible pack against a local roster using disposable data only.

- Open Create roster from Settings and confirm the dedicated setup is obvious.
- Create a Football roster without opening Player Model settings.
- Create a Custom sport/game roster with OVR-only, then rename its attributes.
- Add OVR-only players and confirm the local attribute model remains editable.
- Apply a preset or fine-tune one player and confirm attribute meanings then lock.
- Import a preset pack during roster creation and confirm its model summary before Create.
- Try creating a flat or duplicate-name preset and confirm the editor explains why it cannot save.

## Decision record

After testing, classify each item as **Keep**, **Change**, or **Reject**:

| Item | Decision | Evidence / notes |
|---|---|---|
| Full-screen card stack | Keep provisionally | First phone test felt better than the old slider. |
| OVR-first, OVR-only complete | Pending A.2 | |
| Inset Stripes rail | Pending A.2 | |
| Explicit Next / no preset auto-advance | Pending A.2 | |
| Optional primary + secondary preset | Pending A.2 | |
| High-OVR asymmetric profile | Pending A.2 | |
| Independent OVR | Pending A.2 | |
| Default Football six | Pending A.2 | |
| Default preset vocabulary | Pending A.2 | |
| Dedicated preset editor | Pending A.2 | |
| 3/6 custom attribute creation | Pending A.2 | |
| Dedicated new-roster setup | Pending B.1 | |
| Football / Custom / Pack starting choices | Pending B.1 | |
| OVR-only custom roster before attribute definition | Pending B.1 | |
| Attribute locking only after model-bound local ratings | Pending B.1 | |
| Pack export/import | Pending A.2 | |
| Google Drive pack save | Pending A.2 | |

## Production boundary

A successful experiment proves product behavior, not production readiness. Any
accepted behavior must later be reconciled against the canonical roadmap and
implemented/reviewed with the normal Stripes architecture, migration, privacy,
security, regression, and manual release gates.

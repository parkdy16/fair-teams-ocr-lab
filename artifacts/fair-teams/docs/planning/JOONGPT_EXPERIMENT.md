# JoonGPT Rating Experience Experiment

Status: **EXPERIMENTAL BRANCH ONLY**

Branch: `experiment/joongpt-prototype`

This document records a disposable product experiment. It does not supersede
`STRIPES_ROADMAP.md`, authorize production migration, or change the canonical
launch plan. Accepted findings will be reconciled into the canonical roadmap
only after real-device testing and an explicit product decision.

## Hypothesis

A recreational organizer should be able to rate a player in a few seconds:

**OVR -> pull the Stripes edge -> choose one quick preset -> next player**

The interaction should be faster and more memorable than the current
Defense-to-Attack slider without adding another player-statistics system.

## Product contract under test

- OVR remains the organizer's primary overall-strength judgment.
- A preset is a quick profile-shaping shortcut, not a separate permanent trait.
- Applying a preset seeds the existing six detailed values around the selected
  OVR.
- The generated detailed values remain the editable source of truth.
- OVR-only is a complete and valid rating.
- Advanced Edit remains available when the organizer wants precision.
- A preset must not silently increase OVR.
- Applying a preset to a manually refined profile requires explicit
  replacement confirmation.
- The experiment does not change the team generator, Firestore rules,
  authentication, governance, Google integrations, or shared-workspace
  authority.

## Prototype preset vocabulary

The first experiment deliberately uses plain-language football concepts that a
recreational organizer should understand immediately:

1. **Goal threat** - attacks space, looks to score, and creates direct danger.
2. **Playmaker** - connects play and creates chances for teammates.
3. **Defender** - protects space and gives the team defensive stability.
4. **Fast** - changes the game through speed and recovery runs.
5. **High energy** - runs, presses, and keeps covering space.
6. **Strong** - wins physical battles and protects the ball.
7. **All-rounder** - contributes across the game without one dominant quality.

These names and their numerical templates are prototype material. Testing must
judge both immediate comprehension and whether the seeded profiles feel
credible.

## Interaction under test

### Mobile and tablet

- Rating opens a full-screen stack of player cards.
- New or unrated players appear first.
- The current card presents the player identity and a large OVR control.
- A Stripes-branded edge handle is available within thumb reach.
- Pulling the edge inward reveals the preset strips.
- Sliding to a preset and releasing selects it.
- Selecting a preset in the fast flow saves the rating and deals the current
  card away to reveal the next player.
- The organizer can use OVR only, skip, return to the previous card, or open
  Advanced Edit.
- A visible `What stands out?` control opens the same selector conventionally.
- Reduced-motion behavior and tappable alternatives remain available.

### Desktop

Desktop uses the same player and preset concepts with pointer/keyboard-friendly
controls. It must not require a simulated phone swipe.

## Intentionally untouched systems

- Firebase Authentication and account linking
- Firestore and Storage security rules
- shared-workspace authority and governance
- invitation and workspace-closure flows
- Google Drive / File Cabinet architecture
- the production team evaluator and generator
- Live Split
- canonical roadmap sequencing

## Required verification

Repository checks:

```text
npm run typecheck:live
npm run check:i18n
npm run check:architecture
npm run test:core-regression
npm run test:browser-smoke
git diff --check HEAD
```

Real-device rating test:

- Rate at least 20 players in one session.
- Test OVR-only players.
- Test each preset at low, medium, and high OVR.
- Test Advanced Edit after applying a preset.
- Test applying a preset after manual refinement and verify confirmation.
- Test previous-player recovery.
- Test closing and reopening the flow.
- Test right-thumb reach and accidental edge activation.
- Test in bright outdoor conditions.
- Test reduced-motion and conventional tap-only use.
- Note whether the deal-away transition remains satisfying after repetition.

## Decision record

After testing, classify each item as **Keep**, **Change**, or **Reject**:

| Item | Decision | Evidence / notes |
|---|---|---|
| Full-screen card stack | Pending | |
| OVR-first flow | Pending | |
| Edge-strip gesture | Pending | |
| Conventional preset picker | Pending | |
| Auto-save and advance after preset | Pending | |
| Card deal transition | Pending | |
| Seven-preset vocabulary | Pending | |
| Preset-generated detailed profile | Pending | |
| Advanced Edit handoff | Pending | |

## Production boundary

A successful prototype proves a product interaction, not production readiness.
Any accepted behavior must later be reconciled against the canonical roadmap
and implemented/reviewed with the normal Stripes engineering, regression,
security, and release gates.

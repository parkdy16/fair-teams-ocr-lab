# Stripes Core Regression Gate

Run from `C:\V38OCR\artifacts\fair-teams`:

```text
npm run test:core-regression
```

The command is the mandatory independent gate for cross-cutting changes. It is
Windows-safe, stops on the first failing mandatory subprocess, never deploys or
uses production data, and removes the known local Firebase emulator debug logs
before and after execution.

## Mandatory stages

1. fail-closed runner self-test;
2. every outer `src/lib/**/*.test.ts` production-logic and integration suite;
3. syntax checks for Functions JavaScript and test support;
4. existing Functions/backend and governance tests;
5. Firestore emulator behavior, including P0-S2, Cabinet and the representative
   Stripes Regression Club fixture;
6. production frontend build;
7. `git diff --check HEAD`.

The emulator uses deterministic test-only identities and a Firebase demo project.
It neither reads nor writes production Firebase data.

## Test inventory and CRG-1 gap map

The inventory below classifies the primary behavior each suite actually executes.
Mixed suites are listed under their strongest category and called out where they
also contain source assertions.

### 1. Pure/unit production logic

- `activeSharedWorkspaceAuthorityState.test.ts`
- `fileCabinetDriveAccess.test.ts`
- `googleDriveCabinet.test.ts`
- `googleDriveCabinetPermissions.test.ts`
- `googleDriveConnection.test.ts`
- `googleDriveSharedCabinet.test.ts`
- `organizerGovernanceEligibility.test.ts`
- `sharedRosterAuthState.test.ts`
- `sharedRosterAutosyncController.test.ts`
- `sharedRosterCreationAttempt.test.ts`
- `stripesEmailVerificationService.test.ts`
- `teamGenerator.test.ts`
- `workspaceInvitationOnboardingState.test.ts`
- Functions logic in `emailVerification.test.js`, `organizerRemoval.test.js`,
  `organizerRemovalTransaction.test.js`, `sharedRosterCreation.test.js`,
  `workspaceClosure.test.js`, `workspaceInvitation.test.js`, and
  `workspaceRosterLinkage.test.js`.

### 2. Source/static assertions

- `activeSharedWorkspaceAuthority.integration.test.ts`
- `firebaseGoogleAuth.test.ts` (mixed unit/static)
- `navigationRuntime.integration.test.ts`
- `sharedRosterAutosync.integration.test.ts`
- `sharedRosterLeaveUi.test.ts`
- `sharedWorkspaceCabinet.test.ts` (mixed unit/static)
- `sharedWorkspaceClosureService.test.ts` (mixed unit/static)
- Functions rule/wiring suites `cabinetRules.test.js`,
  `workspaceClosureRules.test.js`, and `workspaceInvitationRules.test.js`.

### 3. Service/integration

- `localRosterCore.test.ts` exercises the production local-storage boundary and
  normalization on repeated save/load.
- Controller and onboarding suites above exercise production service seams with
  deterministic fakes; no external service is called.

### 4. Firestore emulator behavioral

- `cabinetRules.emulator.test.js`
- `coreRegressionRules.emulator.test.js`
- `sharedRosterCreation.emulator.test.js`
- `sharedRosterLinkageRules.emulator.test.js`

### 5. Functions/backend

The ten non-emulator Functions suites invoked by `functions/package.json` execute
production helpers and callable transaction seams. They cover invitation and
email authorization, organizer removal, workspace closure, trusted linkage and
atomic shared-roster creation.

### 6. Component/UI

No component-render harness exists. Focused source assertions protect live
capability wiring and navigation, while the production capability helper and
rules behavior are exercised separately.

### 7. Browser/E2E

None. The short human smoke check below covers the remaining browser-visible
integration risk without repeating emulator behavior.

### 8. Build/type/static verification

- production Vite build: mandatory;
- Functions `node --check`: mandatory;
- patch whitespace check: mandatory;
- full TypeScript project check: informational, because the repository has a
  known nonzero baseline in both live outer source and stale `src/src`.

### Baseline gaps closed by CRG-1

| Mature invariant | Before CRG-1 | Permanent coverage |
| --- | --- | --- |
| Local roster roundtrip and player edit persistence | NONE | GOOD: production local-roster save/load |
| Today `not_here_yet` normalization | NONE | GOOD: production normalization; obsolete `late` is rejected |
| Current team generation and pairing constraints | NONE | GOOD: production generator smoke/regression |
| Three-tab navigation | GOOD | GOOD: existing P0-N1 suite reused |
| Authoritative organizer/member/unrelated capability | GOOD | GOOD: P0-A1 logic plus fixture membership reads |
| Shared player material identity and recoverable autosync | PARTIAL | GOOD: player skill identity plus existing P0-A2 race/failure/retry suites |
| Organizer/Club Access canonical wiring | GOOD | GOOD: production helper plus focused live wiring assertion |
| Invitation, self-leave, last-organizer and closure governance | GOOD | GOOD: existing G1/Functions suites reused |
| Protected-removal target and secret ballot behavior | PARTIAL | GOOD: target rejection plus emulator-private ballot state |
| Equipment, Attendance and Action Board rules | PARTIAL | GOOD: representative-workspace emulator behavior |
| Rating own-submission safety | PARTIAL | GOOD: member-own and unrelated denial; aggregate trust is not blessed |
| Club Notes read/create/delete-own | PARTIAL | GOOD: representative-workspace emulator behavior |
| Cabinet organizer-only config | GOOD | GOOD: existing strict suite plus representative fixture |
| Firebase identity / Drive authorization separation | GOOD | GOOD: existing G2 production-logic suites reused |
| P0-S1/S2/A1/A2/N1 | GOOD individually | GOOD: all are mandatory stages of one independent command |

## Representative fixture

`Stripes Regression Club` is seeded only through a security-rules-disabled local
emulator context. It contains one linked group and roster, two equal organizers,
one ordinary member, one unrelated authenticated identity, representative
players, Equipment, Attendance, Action Board, rating, Club Note, Cabinet and
protected-removal documents. All client assertions then use authenticated
rules-enabled contexts against that same workspace consistency model.

## Mandatory versus informational

Mandatory failures stop the gate and return nonzero. The full-project TypeScript
check is deliberately visible as debt but is not part of pass/fail until a
separate cleanup establishes a real zero-error baseline. Browser/component E2E is
also not claimed by this gate.

## Five-minute human release smoke check

1. On a phone-sized viewport, open one long-lived shared roster and confirm it
   enters the normal Teams setup rather than a missing Today tab.
2. Confirm organizer controls appear for an organizer and do not appear after
   switching to a non-organizer account.
3. Edit one shared player value and wait for **Saved online**; refresh once and
   confirm the value remains.
4. Open Action Board, Equipment and Attendance and confirm each loads the shared
   workspace without a runtime error.
5. Select a representative session roster, generate teams and confirm every
   selected player appears once.
6. Where practical, switch accounts or remove access and confirm the old
   workspace loses privileged controls without showing cached organizer access.
7. Only when a release touches G2/Google: confirm Cloud Backup authorization does
   not configure File Cabinet, then open the configured File Cabinet explicitly.

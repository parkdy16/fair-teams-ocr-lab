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
2. live architecture/import boundary checks, including their synthetic
   fail-closed self-tests;
3. the zero-baseline i18n hard-coded UI-string policy and its synthetic
   fail-closed tests;
4. every outer `src/lib/**/*.test.ts` and `src/i18n/**/*.test.ts`
   production-logic and integration suite;
5. syntax checks for Functions JavaScript and test support;
6. existing Functions/backend, governance and privacy-safe-diagnostic tests;
7. Firestore emulator behavior, including P0-S2, Cabinet and the representative
   Stripes Regression Club fixture;
8. a fresh-process, demo-project Firestore emulator export/import recovery
   rehearsal with restored-data and authority checks;
9. production frontend build;
10. `git diff --check HEAD`.

The emulator uses deterministic test-only identities and a Firebase demo project.
It neither reads nor writes production Firebase data.

H2 and I1 added three discoverable focused commands which Core now owns:

```text
npm run check:architecture
npm run check:i18n
npm --prefix functions run test:recovery:emulator
```

The architecture checker uses the existing TypeScript compiler AST. It keeps
the stale `src/src` tree quarantined, preserves the outer browser entry, blocks
live-source escapes and reverse UI/domain imports, prevents new direct UI
Firebase/fetch shortcuts, and freezes the small set of currently reviewed
low-level Google UI adapter imports. Failures identify the file, line, column
and rule.

The i18n checker uses the same parser dependency but remains a separate,
focused zero-baseline policy. It scans only live outer production JSX/TSX,
rejects high-confidence literal render text and presentation attributes, and
allows only a narrowly scoped, reasoned `i18n-exempt` annotation for genuinely
technical or provider-controlled text. It does not use a violation count or a
large allowlist that could hide newly introduced product language.

The recovery command invokes the Functions-local pinned Firebase CLI, removes
inherited cloud target/credential variables, and explicitly uses only
`demo-stripes-recovery-rehearsal`. It exports a fixed synthetic workspace from
one Firestore emulator lifecycle and imports it into a fresh lifecycle before
checking linkage, membership/roles, representative Club data, Cabinet location
and strict G3 resource metadata, private/server-only records and current
Firestore authority.

## H1 companion gates

The root workflow at `.github/workflows/stripes-ci.yml` composes three mandatory
Stripes checks in one sequential CI job:

```text
npm run typecheck:live
npm run test:core-regression
npm run test:browser-smoke
```

`typecheck:live` checks the shipping outer `src/` tree without the tracked stale
`src/src/` tree. The Core Regression Gate remains the integration command and
already includes the production build. The browser command adds six semantic
Chromium smoke scenarios without production credentials or data.

These gates preserve the constraints in
`docs/architecture/SYSTEM_INVARIANTS.md`. CI success is not deployment approval
and does not replace provider/account or real-device release verification.

## Test inventory and CRG-1 gap map

The inventory below classifies the primary behavior each suite actually executes.
Mixed suites are listed under their strongest category and called out where they
also contain source assertions.

### 1. Pure/unit production logic

- `activeSharedWorkspaceAuthorityState.test.ts`
- `fileCabinetDriveAccess.test.ts`
- `fileCabinetResource.test.ts`
- `fileCabinetResourceProvider.test.ts`
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
- `fileCabinetResourceService.test.ts`
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

The recovery rehearsal separately exercises the emulator's on-disk
export/import path across fresh processes. It reuses the representative fixture
and retains 19 deterministic documents, including separate legacy Club-resource
metadata and strict G3 Cabinet resource records plus invitation/lock state. It verifies
restored G3 authority and immutable-provider/creation fields without calling an
external provider; it is not a managed-cloud restore claim.

### 5. Functions/backend

The non-emulator Functions suites invoked by `functions/package.json` execute
production helpers and callable transaction seams. They cover invitation and
email authorization, organizer removal, workspace closure, trusted linkage and
atomic shared-roster creation. The H2 diagnostic suite also proves that backend
failure logging emits only stable, allow-listed machine fields rather than raw
errors or installation-token suffixes.

### 6. Component/UI

No component-render harness exists. Focused source assertions protect live
capability wiring and navigation, while the production capability helper and
rules behavior are exercised separately. The small browser layer below covers
whole-app shell integration rather than introducing a second component-test
architecture.

### 7. Browser/E2E

`tests/browser/app.smoke.spec.ts` uses Playwright Chromium with deterministic
local-storage fixtures and covers:

- application boot into the saved-roster chooser without a page error;
- entry into the Roster, Teams and Club shell surfaces;
- switching between two local rosters through the real picker;
- fail-closed Club authority for a cached shared roster while signed out;
- generation of two complete teams with every selected player exactly once;
- safe English fallback for an unsupported persisted UI locale, including
  representative shell, modal and Club text without raw keys.

The harness injects explicit demo-only Firebase values, blocks service workers
and aborts every non-loopback request. It does not claim positive signed-in
organizer authority, Google-provider behavior, mobile interaction fidelity or
visual correctness. Those would require a larger safe auth/emulator fixture or
real-provider/manual verification; focused source tests retain File Cabinet
catalog and authority coverage without adding an unsafe browser auth bypass.

### 8. Build/type/static verification

- production Vite build: mandatory;
- Functions `node --check`: mandatory;
- live architecture/import boundary check: mandatory;
- live zero-baseline hard-coded UI-string check: mandatory;
- demo-only synthetic recovery export/import: mandatory;
- patch whitespace check: mandatory;
- live outer-source TypeScript check: mandatory in CI and zero-error;
- full TypeScript project check: informational, because it intentionally still
  includes the divergent stale `src/src` tree and remains nonzero.

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

Mandatory failures stop their command and return nonzero. The full-project
TypeScript check remains visible debt but is not part of CI pass/fail; the
zero-error `typecheck:live` command is the shipping-source gate. Browser smoke is
a mandatory H1 companion command in CI, not an internal stage of
`test:core-regression`. No component-render suite is claimed.

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

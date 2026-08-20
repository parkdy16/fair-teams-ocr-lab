# Stripes project map

Verified: 2026-08-20
I1 implementation base: `1632da3` (local gates verified; worktree remains
uncommitted and no hosted-CI or release claim is made)

## Source boundaries

- Live frontend: outer `src/`.
- `src/src/` is stale/divergent and is not the browser entry point.
- Tracked `.bak` files are historical, not live source.
- This package depends on the parent `C:\V38OCR` pnpm workspace, lockfile, catalog, and base TypeScript configuration.

## High-risk UI/state files

- `src/App.tsx`
- `src/components/ClubTab.tsx`
- `src/components/TaskBoard.tsx`
- `src/components/TodayTab.tsx`
- `src/components/TeamsTab.tsx`
- `src/components/PlayersTab.tsx`

## Backend and persistence boundaries

Ordinary UI work should avoid Firebase initialization, shared-roster services, Action Board services, equipment and attendance persistence, Firebase Functions, API handlers, the messaging service worker, Google integration code, and their listeners/autosave flows.

## File Cabinet resource boundary

- Durable provider-neutral resource/reference contract:
  `src/lib/fileCabinetResource.ts`
- Workspace-scoped Firestore index service:
  `src/lib/fileCabinetResourceService.ts`
- Live exact-ID provider resolution and Picker facade:
  `src/lib/fileCabinetResourceProvider.ts`
- Existing location/setup and minimal index UI:
  `src/components/SharedWorkspaceCabinetCard.tsx`
- Primary index path:
  `sharedGroups/{groupId}/cabinetResources/{resourceId}`
- Standalone compatibility path:
  `sharedRosters/{rosterId}/cabinetResources/{resourceId}` only when the roster
  has no group link.

The older `src/lib/clubResourceService.ts` and
`sharedRosters/{rosterId}/resources` path remain the transitional native
Firebase Storage attachment system. They are not the G3 Cabinet index and must
not be migrated, tightened or deleted as incidental Cabinet work.

## Internationalization boundary

- Durable architecture and contribution guide:
  `docs/architecture/INTERNATIONALIZATION.md`
- Frontend bootstrap, locale policy, formatting helpers and React provider:
  `src/i18n/`
- Canonical bundled English feature segments:
  `src/i18n/resources/`
- Functions-local backend adapter/catalog: `functions/i18n.js` and
  `functions/i18n/en.js`
- Zero-baseline live UI-string policy:
  `scripts/check-i18n-ui-strings.mjs`
- High-value stable-code presentation adapters:
  `src/i18n/activeSharedWorkspaceAuthority.ts`,
  `src/components/SharedRosterAutosyncStatus.tsx`,
  `src/components/SharedWorkspaceCabinetCard.tsx`,
  `src/i18n/emailVerification.ts`, `src/i18n/googleAuth.ts`,
  `src/i18n/aiSmartCommandPresentation.ts` and
  `src/i18n/aiSmartCommandTrustGuard.ts`

English is the only shipped I1 locale. Device-local locale preference is not
workspace authority or durable cloud data. Frontend and Functions catalogs are
separate runtime bundles with one logical canonical English language contract.
The Google-auth adapter maps the currently distinct stable reasons but
deliberately retains the mature raw compatibility message for the broad
`unavailable` reason. Backend recipient-locale authority and actual German or
Korean catalogs are I2 decisions.

## Verification

- Live shipping-source TypeScript: `npm run typecheck:live`
- Architecture/import boundaries: `npm run check:architecture`
- Hard-coded live UI-string policy: `npm run check:i18n`
- Core integration gate, including the production build: `npm run test:core-regression`
- Focused demo-only recovery rehearsal:
  `npm --prefix functions run test:recovery:emulator`
- Browser smoke: `npm run test:browser-smoke`
- Full live-plus-stale TypeScript debt check (informational): `npm run typecheck`
- Standalone production build when specifically needed: `pnpm.cmd --filter @workspace/fair-teams run build`
- Diff check: `git -C C:\V38OCR\artifacts\fair-teams diff --check`
- Status: `git -C C:\V38OCR\artifacts\fair-teams status --short`

The live TypeScript gate explicitly excludes stale `src/src/` and disables
incremental caching so it cannot hide current diagnostics. Do not substitute
the known-nonzero full-project check for that mandatory gate.

The root CI workflow is `.github/workflows/stripes-ci.yml`. It runs the live
typecheck, Core Regression Gate and six-scenario Playwright smoke suite without
deployment or production credentials. See `docs/testing/CORE_REGRESSION_GATE.md`.

The architecture, i18n and recovery commands are mandatory stages inside Core,
so CI inherits them without a second workflow or duplicate stage.

## Durable architecture and operations references

- Sequencing and phase truth: `STRIPES_ROADMAP.md`
- Cross-system constraints: `docs/architecture/SYSTEM_INVARIANTS.md`
- Forward durable schema convention:
  `docs/architecture/DURABLE_SCHEMA_EVOLUTION.md`
- English-only i18n and future-locale convention:
  `docs/architecture/INTERNATIONALIZATION.md`
- Integration/browser gate details: `docs/testing/CORE_REGRESSION_GATE.md`
- Staging, backup and recovery boundaries:
  `docs/operations/STAGING_BACKUP_RECOVERY.md`

## Current UI checkpoint

The approved UI consolidation state is:

- P0 through P4 complete for the approved UI-audit scope.
- P5 remains the ongoing manual regression / launch-quality gate.
- Preserve established phone and desktop interaction differences during new work.
- The current top-level app navigation is Roster, Teams, and Club.
- Today/session setup is part of the Teams flow rather than a separate top-level tab.

## Shared modal architecture

P2 shared modal architecture is implemented in:

`src/components/ui/stripes-modal.tsx`

Established wrappers:

- `StripesWorkspaceContent`
- `StripesSheetContent`
- `StripesEditorContent`
- `StripesConfirmContent`

These wrappers define the preferred Workspace / Sheet / Editor / Confirm roles.

Not every existing dialog must be migrated. Feature-specific Radix dialogs or
custom presentation may remain where migration would change established
behavior, semantics, or layout without a clear benefit.

## External integration checkpoint

Meetup integration planning is tracked in:

`docs/meetup/MEETUP_INTEGRATION_PLAN.md`

Current status:

- eligibility/API access request submitted 2026-08-12
- waiting for Meetup API eligibility confirmation
- do not implement Meetup OAuth/import until access permits it


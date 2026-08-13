# Stripes project map

Verified: 2026-08-13
Baseline commit: `364df454bbf9238f0d936aab511ae41f2758d3ee`

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

## Verification

- TypeScript: `pnpm.cmd --filter @workspace/fair-teams run typecheck -- --incremental false`
- Production build: `pnpm.cmd --filter @workspace/fair-teams run build`
- Diff check: `git -C C:\V38OCR\artifacts\fair-teams diff --check`
- Status: `git -C C:\V38OCR\artifacts\fair-teams status --short`
- No automated lint or test suite is currently configured.
- The TypeScript command is currently blocked in this workspace because `tsc` is not resolvable; report this rather than installing packages.

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


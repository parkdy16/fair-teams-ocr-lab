# Stripes project map

Verified: 2026-08-12  
Baseline commit: `9359997d8f49a137318d2c6ccecc7aa18dc12a13`

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

## P2 modal baseline

- 43 feature-specific `DialogContent` usages.
- 1 proper `AlertDialogContent` usage.
- 33 custom fixed overlays, including 20 bottom-aligned variants.
- `TaskBoard.tsx` repeats multiple modal sizing recipes.
- Generic Sheet and Drawer primitives exist.
- No shared Stripes four-category modal system currently exists.

These counts are a snapshot at the baseline commit. Refresh them only when a task specifically depends on current counts.

# Stripes — Codex Project Instructions

## Product

Stripes is an existing production React web/PWA application for recreational sports organizers.

The application includes:

* roster management
* Today / attendance setup
* fair team generation
* shared club tools
* equipment management
* Action Board / voting / tasks
* club collaboration features

This is an established application.

Preserve existing behavior and user muscle memory unless a task explicitly requires a change.

---

## Repository structure warning

The live frontend source is the outer:

`src/`

There is also a tracked divergent:

`src/src/`

The inner `src/src/` tree is stale and is NOT the browser entry point.

Do not implement feature or UI changes in `src/src/`.

Because TypeScript may still inspect that tree, do not delete, move, synchronize, or otherwise modify it unless a separate task explicitly addresses this repository issue.

Always confirm that edits are being made to the live outer source tree.

---

## Application architecture

The app uses:

* React 19
* TypeScript
* Vite
* Tailwind CSS v4
* Radix/shadcn-style UI primitives
* Firebase for shared/cloud features

The application does not currently use a meaningful route architecture.

`App.tsx` owns substantial application shell, navigation, persistence, overlay, and shared state behavior.

Today is NOT a top-level navigation tab.

The main navigation is:

* Roster
* Teams
* Club

Today is the setup state inside the Teams workflow.

Generated teams are the Teams result state.

Do not restructure this navigation unless explicitly requested.

---

## Core engineering rule

Inspect before editing.

For any change that may affect:

* multiple components
* responsive layouts
* shared CSS
* dialogs/modals
* application state
* persistence
* navigation
* shared interactions

first:

1. inspect the relevant implementation
2. identify dependencies
3. identify persistence/state implications
4. explain the smallest proposed implementation
5. stop before editing when the task requests plan-only mode

Never perform broad speculative cleanup while implementing a bounded task.

---

## Scope discipline

Only change what the requested task requires.

Do not:

* redesign unrelated UI
* rename unrelated variables/components
* reorganize unrelated files
* perform opportunistic refactors
* mass search-and-replace without inspecting every affected use
* add new features while fixing UI issues
* silently fix unrelated problems
* deploy, commit, push, or merge unless explicitly instructed

If an unrelated issue is discovered, report it instead.

---

## Current UI roadmap

The approved Stripes UI consolidation sequence is:

P0 — correctness / overflow / clipping
P1 — typography system
P2 — shared modal architecture
P3 — mobile density and visual cleanup
P4 — desktop responsive refinement
P5 — regression gates

Do not jump ahead to later phases unless explicitly requested.

The objective is evolution, not redesign.

During P0:

* do not implement the typography redesign
* do not implement the shared four-modal system
* do not broadly clean global CSS
* do not restructure feature architecture

P0 is correctness only.

---

## Responsive behavior

Stripes has intentionally different phone and desktop interactions.

A desktop improvement must not regress mobile behavior.

A mobile improvement must not unnecessarily alter desktop behavior.

Important validation widths:

* 360 px
* 390 px
* 430 px
* approximately 768 px
* 1024 px
* 1280 px
* 1440 px

Also consider:

* German text
* long player/member names
* custom vote labels
* empty states
* large rosters
* 125–150% browser/text scaling

Some current layouts intentionally use root/internal overflow control and fixed navigation.

Do not remove existing overflow rules merely because they appear suspicious.

However:

Do not use new `overflow-x-hidden` rules to conceal a component that does not fit.

Fix the actual component width/layout whenever feasible.

---

## Interaction protection

Do not change established interactions unless explicitly requested.

Important existing behavior includes:

### Teams

Phone:

* tap/select swapping

Desktop with fine pointer:

* drag/drop player interaction

Do not unify these interaction models unless explicitly requested.

### Action Board

Phone:

* explicit Move control
* no mobile long-press drag

Desktop:

* drag/drop movement may be used

Moving a card to Done represents completion.

Moving it back must remain reversible.

### Shared/cloud behavior

Do not disturb:

* authentication
* shared-roster synchronization
* club ratings
* attendance/conduct persistence
* equipment persistence/autosave
* Action Board persistence
* Firebase listeners
* notification functions
* Google Drive/Sheets persistence
* onboarding state

UI cleanup must not silently alter persistence or application logic.

---

## Action Board

The Action Board is for durable decisions and actions, not chat.

Signal or similar messaging tools handle discussion.

Core principles:

* simple card fronts
* durable decisions
* clear ownership
* reversible workflow state
* lightweight institutional memory
* compact comment context
* explicit mobile movement
* desktop drag where appropriate

Do not reintroduce mobile long-press drag.

---

## Equipment

Equipment UI and persistence behavior are closely coupled inside `ClubTab.tsx`.

Be especially careful around:

* autosave
* pointer/drag behavior
* editor state
* Firestore subscriptions
* locally cached equipment data
* equipment snapshots used by Action Board decisions

Do not restructure Equipment markup broadly during unrelated UI work.

---

## Typography direction

The intended future direction is:

* Fredoka primarily for brand/display personality
* Outfit primarily for functional product UI

This is NOT fully implemented today.

Current global CSS includes a `.fairteams-visual-refresh .font-black` rule that causes functional UI to switch to Fredoka.

Do not fix this during P0.

Typography consolidation belongs to P1.

When P1 begins:

* inventory typography usage first
* define shared roles/tokens
* avoid blind global class replacement
* migrate incrementally

---

## Modal architecture direction

The intended future modal architecture has four conceptual categories:

### Workspace

Large/full-screen mobile working surfaces.

Examples:

* Action Board
* Equipment
* history/evolution workspaces

### Sheet

Small contextual actions.

Examples:

* Move
* Add to card
* compact option menus

### Editor

Forms and creation/editing surfaces.

Examples:

* vote setup
* equipment configuration
* player configuration

### Confirm

Compact confirmation/destructive dialogs.

This architecture is NOT currently implemented as a shared system.

The current app uses generic Radix dialogs plus many feature-specific overrides and some custom overlays.

Do not pretend the four-modal architecture already exists.

Its implementation belongs to P2 and should be incremental, starting with selected surfaces rather than migrating all dialogs at once.

---

## CSS rules

The current codebase contains broad global overrides and `!important` usage.

These are existing conditions, not desired new patterns.

Do not broadly remove or rewrite them during unrelated tasks.

For new work prefer:

* shared components
* design tokens
* scoped styles
* explicit responsive behavior
* `min-width: 0` where flex/grid content needs to shrink
* content-aware layouts

Avoid introducing:

* new broad global overrides
* arbitrary new `!important`
* duplicated modal sizing hacks
* breakpoint-specific fixes when a reusable layout rule is appropriate
* overflow clipping that merely hides an underlying width error

Changes to global CSS require explicit impact analysis first.

---

## High-risk files

Treat these as high-risk because UI, state, persistence, and interaction logic are closely combined:

* `src/App.tsx`
* `src/components/ClubTab.tsx`
* `src/components/TodayTab.tsx`
* `src/components/TaskBoard.tsx`
* `src/components/TeamsTab.tsx`
* `src/components/PlayersTab.tsx`

Do not perform broad cleanup in these files as part of a small UI fix.

---

## Backend boundaries

UI-focused tasks should avoid modifying backend/persistence modules unless a confirmed defect requires it.

Important boundaries include:

* Firebase initialization
* shared roster services
* Action Board services
* equipment services
* attendance services
* Firebase Functions
* API handlers
* messaging service worker
* Google integration code

If a visual change appears to require persistence/backend changes, stop and explain why before proceeding.

---

## Context efficiency

* Avoid redundant repository-wide discovery.
* Before broad searches, check this file, `STRIPES_ROADMAP.md`, `docs/codex/PROJECT_MAP.md`, and the active phase plan.
* Reuse recently verified documented facts and approved patterns unless relevant source changed or contradicts them.
* For bounded tasks, inspect directly relevant live files first and expand only when targeted inspection is insufficient.
* Do not rescan stale `src/src`, `.bak`, archives, generated output, or unrelated docs.
* Do not recount an existing repository-wide inventory unless the task requires current counts.
* Keep verification output and final reports concise: record pass/fail, actionable errors, relevant warnings, and implementation results.

---

## Verification

The repository currently has build and typecheck commands but no automated lint or test suite.

For relevant changes, use the existing commands discovered from the repository.

On the current Windows/PowerShell environment, prefer `pnpm.cmd` where PowerShell execution policy blocks `pnpm.ps1`.

After implementation:

1. run TypeScript verification
2. run production build
3. run `git diff --check`
4. inspect `git status --short`
5. inspect the complete git diff
6. report every changed file and why
7. report uncertainty explicitly
8. do not claim visual correctness unless it was actually verified

Manual responsive validation is still required until P5 introduces stronger regression gates.

---

## Git and deployment

Do not:

* commit
* push
* merge
* deploy to Vercel
* deploy Firebase

unless explicitly instructed.

Leave changes reviewable first.

One release objective at a time.

---

## Definition of done

A task is complete only when:

* the requested issue is addressed
* relevant existing behavior remains intact
* typecheck/build succeed where applicable
* no unintended files changed
* responsive implications were considered
* persistence/backend behavior was preserved
* uncertainty is disclosed rather than guessed

- This package depends on the parent `C:\V38OCR` pnpm workspace, including the workspace lockfile, catalog, and base TypeScript configuration. Do not treat the package as fully standalone.
- Tracked `.bak` files are not live source files. Ignore them when identifying the active implementation unless a task explicitly requires historical comparison.
- “PWA” in this project does not currently mean general offline application support; no general offline caching service worker is present.

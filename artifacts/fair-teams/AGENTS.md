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

## Core regression gate

Before implementing a cross-cutting change, record its blast radius across
authentication, authority, data models, persistence, navigation and mature Club
features. Feature-specific tests alone are not sufficient for such changes.

Run `npm run test:core-regression` before a cross-cutting patch is approved. The
gate protects mature Stripes invariants independently of the feature currently
being developed.

If the gate fails, stop and determine whether the cause is a product regression,
a test defect or an explicitly intended product change. Never casually change
an expectation merely to make the gate green. Include production-like legacy or
long-lived data shapes when they are relevant.

After security, data-model or authentication changes, perform an adversarial
read-only audit in addition to the gate. Codex implementation, testing and audit
remain separate from release approval: selective staging, commit, push and
deployment require explicit authorization.

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

Current state:

* P0 through P4 are complete for the approved UI-audit scope.
* P5 remains an ongoing manual regression and launch-quality gate.
* Continue to preserve the completed P0-P4 behavior rather than reopening
  those phases during unrelated work.
* New product work should respect the responsive, typography and modal systems
  established during the consolidation.

The objective remains evolution, not redesign.

Do not broadly clean global CSS, restructure feature architecture, or modify
unrelated surfaces during bounded work unless explicitly requested.

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

The current Stripes typography system is:

* Fredoka primarily for brand/display personality
* Outfit primarily for functional product UI

P1 typography consolidation is complete for the approved UI-audit scope.

Preserve the current role separation rather than introducing broad global font
overrides during unrelated work.

When changing typography:

* prefer existing shared roles and established component patterns
* avoid blind global class replacement
* keep functional controls in the Outfit UI role unless there is a deliberate
  display/brand reason to use Fredoka
* verify phone and desktop behavior after meaningful typography changes

---

## Modal architecture direction

P2 shared modal architecture is implemented for the approved UI-audit scope.

The shared wrappers live in:

`src/components/ui/stripes-modal.tsx`

Use the four established conceptual roles:

### Workspace

Large working surfaces.

Shared wrapper:

`StripesWorkspaceContent`

Examples:

* Action Board
* Equipment
* history/evolution workspaces

### Sheet

Small contextual actions.

Shared wrapper:

`StripesSheetContent`

Examples:

* Move
* Add to card
* compact option menus

### Editor

Forms and creation/editing surfaces.

Shared wrapper:

`StripesEditorContent`

Examples:

* vote setup
* equipment configuration
* player configuration

### Confirm

Compact confirmation/destructive dialogs.

Shared wrapper:

`StripesConfirmContent`

P2 does not mean every dialog in Stripes must use one of these wrappers.

Some feature-specific Radix dialogs or custom presentation may remain where
migration would change established behavior, semantics, or layout without a
clear benefit.

For new modal work:

* choose the conceptual role first;
* prefer the matching shared Stripes wrapper where appropriate;
* preserve existing phone/desktop interaction differences;
* do not perform broad dialog migrations during unrelated work;
* do not add another shared modal pattern without a demonstrated need.

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

## Internationalization

Stripes currently ships only English, but live user-facing product text must
follow `docs/architecture/INTERNATIONALIZATION.md`. Add semantic canonical
English catalog keys, use the shared plural/`Intl` patterns, and keep
user/provider content plus persisted machine values untranslated. Run
`npm run check:i18n` for user-facing frontend work; narrowly reasoned technical
exemptions are allowed, broad hard-coded-string bypasses are not.

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

The permanent automated core gate is `npm run test:core-regression`. The full
project TypeScript check remains informational until the existing live and stale
tree baseline is repaired in a separate phase; do not hide or count-match its
diagnostics to manufacture a green type gate.

For relevant changes, use the existing commands discovered from the repository.

On the current Windows/PowerShell environment, prefer `pnpm.cmd` where PowerShell execution policy blocks `pnpm.ps1`.

After implementation:

1. run the core regression gate for cross-cutting changes
2. run TypeScript verification as an explicit informational check while its baseline is nonzero
3. run production build if the gate was not applicable
4. run `git diff --check`
5. inspect `git status --short`
6. inspect the complete git diff
7. report every changed file and why
8. report uncertainty explicitly
9. do not claim visual correctness unless it was actually verified

P5 is the ongoing regression gate.

Manual responsive validation remains required for meaningful UI changes until
stronger automated regression coverage is deliberately added.

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

<!-- ROADMAP_DISCIPLINE_START -->

## Roadmap and phase discipline

`STRIPES_ROADMAP.md` is the authoritative source for current product direction,
phase status, approved architecture decisions, blocked work and deferred work.

`AGENTS.md` defines how implementation work is executed.

Important working rules:

- P0-P5 initial UI consolidation/regression pass is complete.
- P5 regression checks remain an ongoing launch gate; do not restart P0-P5 as
  unfinished implementation phases unless the roadmap explicitly reopens one.
- Before substantial work, identify the current roadmap phase/task.
- Follow roadmap order rather than jumping to later attractive features.
- When a major implementation step is completed or an approved product /
  architecture direction changes, update `STRIPES_ROADMAP.md` before moving on.
- Do not silently continue implementation from superseded roadmap wording.
- When roadmap sections conflict, the explicitly marked Current Architecture
  Checkpoint takes precedence until older sections are cleaned up.
- Continue using small atomic, independently revertible tasks.
- Stop at phase boundaries or for new product decisions, architecture
  decisions, backend/persistence changes or material scope expansion.

Do not duplicate detailed product architecture in `AGENTS.md`; keep those
decisions in `STRIPES_ROADMAP.md`.

### Architecture invariants and preventive hardening

`docs/architecture/SYSTEM_INVARIANTS.md` defines durable architecture and safety
constraints that future work must preserve.

Before security, persistence, schema, shared-workspace authority, Google
integration, cross-cutting architecture or team-engine work:

1. read the current roadmap phase;
2. read `docs/architecture/SYSTEM_INVARIANTS.md`;
3. identify the relevant regression/release gates;
4. preserve those invariants unless the task explicitly approves an
   architecture change and updates the documentation/tests together.

The roadmap H-track defines when preventive architecture hardening is required.
Do not bypass an H gate merely because later feature work is attractive.

Hardening is not permission for broad cleanup or redesign.

For an approved, well-scoped H milestone, Codex should normally execute the
whole bounded milestone in one run: inspect, implement, test, inspect its diff
and report. Do not fragment an H milestone into unnecessary micro-tasks or ask
for routine implementation decisions that can be resolved safely from the
repository.

Stop and request a decision only when the work encounters:

- genuinely undefined product behavior;
- conflicting architecture requirements;
- material security/privacy authority expansion;
- broader OAuth scope;
- production data/configuration/IAM changes;
- destructive or irreversible operations;
- a material scope expansion;
- an unexpected defect that makes the approved task unsafe.

Production commit, push, deployment, migrations, IAM and external cloud-resource
changes still require explicit authorization.

<!-- ROADMAP_DISCIPLINE_END -->

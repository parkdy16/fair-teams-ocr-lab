# P2 modal plan

## Goal

Establish the approved Stripes modal architecture incrementally:

- Sheet
- Workspace
- Editor
- Confirm

## P2-1 — Sheet exemplar

Status: complete. Implementation commit: `04a68de`.

- Create `src/components/ui/stripes-modal.tsx`.
- Introduce `StripesSheetContent` by wrapping the existing Radix-backed `DialogContent`.
- Preserve the existing bottom-sheet geometry.
- Migrate only Action Board “Add link”.
- Preserve state, autofocus, validation, `addLink()`, close behavior, and mobile/desktop positioning.
- Do not introduce Workspace, Editor, or Confirm yet.

Decision: modal category wrappers compose the existing Radix-backed `DialogContent`; they do not replace dialog state roots or feature logic.

## P2-2 — Product link sheet migration

Status: complete. Implementation commit: `bf7cc61`.

- Migrated only Action Board “Product link” to the proven `StripesSheetContent`.
- Preserved its existing state, validation, autofocus, remove/save behavior, and narrower geometry.

## P2-3 — Editor exemplar

Status: complete. Implementation commit: `587d688`.

- Added `StripesEditorContent` as a separate wrapper around the existing `DialogContent`.
- Migrated only Action Board “New topic”.
- Preserved its mobile-bottom/desktop-centered geometry, scrolling, autofocus, state reset, validation, and creation flow.

## P2-4 — Confirm exemplar

Status: complete. Implementation commit: `d3fe456`.

- Added `StripesConfirmContent` by wrapping the existing Radix-backed `AlertDialogContent`.
- Migrated only the Roster player-removal confirmation.
- Preserved AlertDialog semantics, copy, geometry, cancellation, and removal behavior.

After each completed P2 item, record its status, implementation commit, and any important architectural decision.

## P2-5 — Workspace exemplar

Status: complete. Implementation commit: 25afde9.

- Added `StripesWorkspaceContent` as a separate wrapper around the existing Radix-backed `DialogContent`.
- Migrated only Action Board “Evolution”.
- Preserved its full-screen mobile and contained desktop workspace geometry, scrolling structure, close behavior, and feature logic.
- No other workspace or dialog migrations were included.

## P2-6 — To-do details sheet migration

Status: complete. Implementation commit: c3b00d3.

- Migrated Action Board “To-do details” to the proven `StripesSheetContent`.
- Preserved existing state, autofocus, people selection, validation, save behavior, and geometry.
- No feature logic changed.

## P2-7 — Simple Action Board sheet migrations

Status: complete. Implementation commit: 93acf28.

- Migrated “Decision note” to `StripesSheetContent`.
- Migrated card editing surfaces for Note, Assignees, and Due date to `StripesSheetContent`.
- Preserved existing state, autofocus, validation, save behavior, and geometry.
- No feature logic changed.

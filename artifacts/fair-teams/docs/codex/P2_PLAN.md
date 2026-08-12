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

After each completed P2 item, record its status, implementation commit, and any important architectural decision.

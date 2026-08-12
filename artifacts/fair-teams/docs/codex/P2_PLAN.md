# P2 modal plan

## Goal

Establish the approved Stripes modal architecture incrementally:

- Sheet
- Workspace
- Editor
- Confirm

## P2-1 — Sheet exemplar

Status: approved, implementation pending.

- Create `src/components/ui/stripes-modal.tsx`.
- Introduce `StripesSheetContent` by wrapping the existing Radix-backed `DialogContent`.
- Preserve the existing bottom-sheet geometry.
- Migrate only Action Board “Add link”.
- Preserve state, autofocus, validation, `addLink()`, close behavior, and mobile/desktop positioning.
- Do not introduce Workspace, Editor, or Confirm yet.

After each completed P2 item, record its status, implementation commit, and any important architectural decision.

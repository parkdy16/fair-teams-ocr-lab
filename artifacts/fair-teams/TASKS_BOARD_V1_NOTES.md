# Fair Teams v1.50 · Tasks Board

Implemented against the v1.49 shared-recovery source checkpoint.

## Included
- One board per roster/workspace
- Independent editable board name, defaulting to roster name
- Custom columns: add, rename, reorder, archive, restore, delete when empty
- Trello-inspired mobile horizontal layout (84vw / max 320px columns)
- Pastel board background derived from roster color
- Compact Club-tab summary rather than embedded board
- Card create/edit/delete, assignee, due date, category, notes
- Short tap flips card to recent activity
- Long press opens reliable move-card sheet
- Activity records for create/edit/assign/move
- Local single-organizer storage keyed to stable roster ID
- Existing Firebase sharing used for live collaboration
- Firestore data isolated under taskBoard/config subcollections

## Firestore paths
- sharedRosters/{rosterId}/taskBoard/config
- sharedRosters/{rosterId}/taskBoard/config/columns/{columnId}
- sharedRosters/{rosterId}/taskBoard/config/cards/{cardId}

The same group path pattern is supported when a group-scoped ID is provided.

## Validation status
The changed TypeScript/TSX files pass syntax transpilation. Full typecheck/build could not run in the sandbox because the uploaded dependency folder does not contain the actual Node/Vite type packages. Run the normal local install/typecheck/build before production deployment.

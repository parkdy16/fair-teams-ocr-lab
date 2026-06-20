# AI Main Production Import Modal Fix

Restores the local import preview/confirmation modal and roster tools notice modal in App.tsx.

The local import flow was still parsing the selected file and setting `localImportPreview`, but the modal that lets the user confirm the import was missing from the rendered JSX. That made local roster import appear broken because no confirmation UI appeared after choosing a file.

This patch restores:

- Local roster/backup import preview modal
- Confirm import button
- Cancel import button
- Roster tools notice modal for success/warning/error messages

No AI behavior is changed.

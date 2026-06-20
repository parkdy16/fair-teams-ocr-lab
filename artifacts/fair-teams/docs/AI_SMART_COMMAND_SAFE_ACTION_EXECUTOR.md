# AI Smart Command safe action executor

This patch wires the first non-destructive AI action cards into real Fair Teams state.

## Executable now

- Select matched existing players for Today
- Prepare the Teams tab for an explicit team count, such as "make 6 teams"
- Prepare the Teams tab for an even players-per-team request, such as "make 5v5", when the selected player count fits exactly
- Add simple Keep Together / Keep Separate pairing rules for two matched existing roster players
- Add Club Notes, preserving the previous shared-roster guard

## Still not executable

- Add new player
- Change player skill
- Generate teams automatically
- Lock a player to a specific team/color
- Move equipment bags
- Change roster color
- Rename roster
- Delete/remove anything

These remain preview/confirmation-only until each feature has a clear undo/safety path.

## UX behavior

The AI assistant still shows an assistant reply first. Action cards now show Apply/Set/Select for the safe actions above. Applying a team setup switches to the Teams tab and updates the Teams selector. It does not press Generate automatically.

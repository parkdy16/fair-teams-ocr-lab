# AI Smart Command invalid JSON + all players fix

This patch makes the AI smart command route safer when the model returns malformed output.

Changes:

- Adds deterministic hints for “select all players / everyone on the roster”.
- Adds deterministic hints for “make N teams” as teamCount, separate from “NvN” players-per-team.
- Merges deterministic actions into valid AI responses when the model forgets obvious app actions.
- Falls back to a safe Fair Teams response instead of showing a raw “AI returned invalid JSON” error.
- Shows teamCount details in the test panel.

Example command:

```text
select all players on the roster and make 6 teams
```

Expected preview:

- Select every roster player for Today.
- Set team count to 6.

These actions remain preview-only until the Today/team action handlers are wired.

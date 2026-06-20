# AI Smart Command Reliability Framework

This patch moves Smart Command away from one-off phrase fixes and toward a layered command system.

## Layers

1. **Local app parser** detects obvious Fair Teams grammar before the API result is trusted.
   - player lists
   - all roster players
   - 5v5 / 6v6 players-per-team
   - number of teams
   - Club Notes text
   - roster color / rename requests
   - navigation requests
   - generate teams requests
   - spread role requests such as one defender per team

2. **OpenAI parser** reads the full messy multilingual command and returns Fair Teams action JSON.

3. **Response normalizer** sanitizes the model response.
   - unknown action types become `unsupported_action`
   - missing fields are filled safely
   - support status is inferred from the capability map
   - obvious local app actions are merged back in

4. **Fallback layer** returns a safe local result if the model returns malformed JSON or the OpenAI request fails.

## Why this matters

The user should not see raw errors like `invalid JSON`. If the AI answer is malformed, the app should still return any deterministic actions it could safely detect, such as:

- select all roster players
- make 6 teams
- add a Club note with quoted text
- understand roster color as not wired yet

## Test cases

A starter command test list lives in:

```text
artifacts/fair-teams/docs/ai-command-tests.json
```

Use this list as a manual batch test before adding more features. Future work can add an actual local test runner for the backend parser.

## Current execution status

Executable:

- `club_add_note`

Preview-only:

- `select_players`
- `set_team_size`
- `set_team_count`
- `add_pairing_rule`
- `lock_player_to_team`
- `spread_role_across_teams`
- `generate_teams`

Understood but not wired:

- `set_roster_color`
- `rename_roster`
- `open_app_area`
- equipment commands

Needs confirmation:

- adding new players
- setting skill for new players
- destructive actions

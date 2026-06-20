# AI Smart Command app-brain patch

This patch makes `/api/ai-smart-command.js` less dependent on one-off prompt phrases.

## What changed

- Adds a compact Fair Teams operating manual to the system prompt.
- Explains Roster, Today, Teams, Club/shared rosters, pairing rules, team locks, balancing preferences, new-player skill suggestions, and safety rules.
- Adds deterministic command hints before calling OpenAI:
  - likely comma-separated player lists
  - exact/alias roster matches
  - unknown listed names
  - possible 5v5 / 6v6 team-size request
  - mismatch warning when too few named players are listed for the requested team size
- Sends those hints to the AI and tells it every candidate name must appear in actions, confirmations, or unresolved items.

## Why

Instead of making 100 micro prompt fixes, the model now receives both:

1. a stable app manual, and
2. app-side pre-parsed hints from the current roster and command.

This should make commands like:

`Joon, Jorge, Jan, Arthur, Kira are playing today. Make 5v5 teams.`

return:

- existing player selections for names found in the roster
- a missing-player confirmation for Kira if not in the roster
- team size 5v5
- a warning that 5v5 requires 10 total players

## Still intentional

The AI still only proposes safe structured actions. It does not directly mutate the roster or generate final teams.

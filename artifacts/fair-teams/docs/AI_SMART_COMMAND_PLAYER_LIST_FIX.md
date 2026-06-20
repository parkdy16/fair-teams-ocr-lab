# AI Smart Command player-list fix

This patch tightens the Smart Command parser around player-list commands such as:

- `Joon, Jorge, Jan, Arthur, Kira are playing today. Make 5v5 teams.`
- `Sarah und Tommy heute nicht zusammen. Wir spielen 5 gegen 5.`
- `조지, 사라, 토미 오늘 와. 6대6으로 해줘.`

Changes:

1. The backend prompt now explicitly treats `are playing today`, `for today`, and bare comma-separated names as a request to select those players.
2. Every mentioned player must be returned either as a matched roster player in `select_players`, a missing-player confirmation, or an ambiguous-player confirmation.
3. Unknown names such as `Kira` should produce `add_new_player_suggestion` plus a confirmation.
4. If the user asks for 5v5 but names fewer than 10 players, the response should still set 5v5 but also add an unresolved note that more players are needed.
5. The phone test panel now displays `newPlayerName` and unresolved warnings, so missing-name suggestions are visible.

This still previews actions only. It does not apply changes to the roster or Today selections.

# AI Smart Command action routing fix

Fixes a routing bug where action statements containing Fair Teams feature words could be answered as product Q&A.

Example fixed:

`Joon, Jorge, Jan and Arthur are playing today.`

This should create/select Today player actions, not explain what the Today tab is.

Changes:

- Adds a strong app-command intent check before direct Fair Teams knowledge-base answers.
- Player lists, select-all, club notes, team generation, pairing, roster color/rename, navigation, spread-role, and equipment action hints now bypass Q&A routing.
- Equipment feature questions such as `What is equipment for?` no longer become fake equipment move actions.
- The backend prompt now explicitly says action requests beat product Q&A and player-list statements should not be answered as Today-tab explanations.

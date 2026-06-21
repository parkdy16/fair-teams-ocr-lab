# Fair Teams Assistant Scenario Checklist v1

Use this checklist before adding more AI command behavior. The assistant should prefer safe, local, app-state-aware actions over generic chatbot answers.

## Core app Q&A

1. `What is Fair Teams Assistant?`
   - Explain in friendly organizer language.
   - Mention app questions, Today selection, add/remove players, late players, team setup, reshuffle, and safe action cards.
   - Do not mention APIs, JSON, branches, or implementation wiring.

2. `What is the Today tab?`
   - Explain Today as the attendance/selection step before Teams.

3. `What is Screenshot Import / Smart Import?`
   - Explain screenshot crop, offline OCR default, Review Names, Lost & Found, Meetup/Other modes.

4. `What is the difference between Voice Select and AI Assistant?`
   - Voice Select = fast simple name selection.
   - AI Assistant = broader helper for corrections, app questions, team setup, and action cards.

5. `How do special abilities work?`
   - Explain they are local/private roster traits used by the local team generator.
   - Shared/Club rosters use Club average ratings instead.

## Today selection and name matching

6. `Add June, George and Briesh to Today`
   - Match June → Joon, George → Jorge, Briesh → Brijesh.
   - Action: Add to Today.
   - Do not clear existing Today players.

7. `Remove June and George from Today`
   - Match June → Joon, George → Jorge.
   - Action: Remove from Today.
   - Never suggest Add Player in remove mode.

8. `Today we have Joon, Tanja and Brijesh`
   - Treat as today’s current list.
   - If Today already has players, default to Replace Today and offer Add alternative.

9. `Joon is also here`
   - Add Joon only.
   - Do not clear existing Today selection.

10. `Tanja is late`
    - Select Tanja for Today if needed.
    - Show Mark late action.

11. `Joon, Jorge, Tanja and Brijesh are here, but Tanja is late`
    - Match all names.
    - Select/add all four.
    - Mark Tanja late.

12. `Add Fillip with F and Raphael as new player`
    - Preserve Fillip spelling.
    - Do not create a fake player named New.
    - Do not silently merge Raphael into Rafael; show possible existing match if present.

## Team generation

13. `Make two teams with the players selected in Today`
    - Use current Today selection.
    - Action: Generate teams, teamCount=2.
    - Do not parse command words as fake players.

14. `Make fair teams from selected players`
    - If team count is missing, ask how many teams.

15. `Make 5v5 from selected players`
    - Check selected player count.
    - If not enough or uneven, explain clearly.

16. `Shuffle the teams`
    - If teams exist, reuse current team count and reshuffle.
    - If no teams exist, ask for team count or selected players.

17. `Make two teams of five with the best players from current roster`
    - Select top 10 by roster skill.
    - Clear Today only after user taps Replace + Generate.
    - Generate 2 teams.

18. `Make 5v5 with the weakest players from the roster`
    - Select weakest 10 by skill.
    - Clear Today only after confirmation.

19. `Select everyone and make 4 teams`
    - Replace Today with all roster players.
    - Generate 4 teams after confirmation.

## Navigation and safe unsupported behavior

20. `Open Today`
    - Show executable Open Today action.

21. `Show me the Teams tab`
    - Show executable Open Teams action.

22. `Save the current roster locally on my phone`
    - Explain local edits are stored automatically.
    - Manual path: Roster Tools → Local Backup.
    - Do not pretend the assistant created a backup.

23. `The font seems small, is that okay?`
    - Treat as UI feedback.
    - Do not invent a font-size setting.

24. `Same players as last week, make different teams`
    - If attendance history is not available, say so and ask whether to use current Today selection.

## Safety rules

- Action requests should not become generic app-info answers.
- App-info questions should not become fake action cards.
- Unknown names in add mode may suggest Add Player only after near-match checks.
- Unknown names in remove mode should be unresolved warnings, never Add Player suggestions.
- Explicit new-player commands should not silently merge into existing similar players.
- Replace Today only when the user clearly says replace/only/everyone/today we have, or when they tap a Replace action card.

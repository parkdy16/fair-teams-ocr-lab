# AI Smart Command: Club Notes guard clarification

This patch keeps Club Notes as a shared-roster feature, but makes the AI apply guard more precise.

Before this patch, the AI Club Notes handler used the Club rating readiness flag. That could incorrectly say "sign in on a shared roster" when the user was signed in but the shared roster/user state was still settling, or when the current roster was local.

Now Club Notes has its own readiness check:

- current roster must be shared
- shared roster id must be available
- Firebase/OpenAI account auth must be available

The user-facing failure reason is more specific:

- local roster: open or create a shared roster first
- shared roster still connecting: try again in a moment
- account still connecting: try again in a moment
- not signed in: sign in to add Club Notes

This does not make Club Notes available for local/private rosters. That is intentional for now because Club Notes are a shared organizer workspace.

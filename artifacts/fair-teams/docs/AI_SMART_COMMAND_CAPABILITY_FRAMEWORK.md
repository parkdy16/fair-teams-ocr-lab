# AI Smart Command capability framework

This patch changes Smart Command from one-off prompt examples into a capability/action framework.

## Product rule

The AI may understand many Fair Teams requests, but the app only applies actions that have a safe handler.

The response now separates:

- `executable`: safe action is wired and can be applied now.
- `preview_only`: AI understood it, but this patch only previews it.
- `understood_not_wired`: AI understood the request, but Fair Teams has no handler yet.
- `needs_confirmation`: understood, but must ask first.
- `unsafe`: protected/destructive.

## First executable non-team action

`club_add_note` is now executable from the Club tab Smart Command panel.

Example:

> Can you add a note saying "oh im so cool" on Club Notes?

Expected result:

- Action: Add Club note
- Detail: `note: "oh im so cool"`
- Button: Apply

The app will add the note only when the current roster is shared and the user is signed in. Otherwise it fails safely with a clear message.

## Why this helps

Requests such as changing roster color, renaming rosters, equipment changes, opening app areas, and deleting notes can now be understood and labeled as not wired yet instead of failing as unknown. Future work should add one safe handler at a time.

## Cost note

The capability manifest is compact static app knowledge. It does not call the API by itself. API cost occurs only when a user sends a Smart Command. Later we can compress the manifest further or use local pre-routing for obvious commands.

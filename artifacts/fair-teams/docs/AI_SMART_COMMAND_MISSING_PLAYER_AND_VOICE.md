# AI Smart Command: Missing Player + Push-to-Talk Voice

This patch adds two first-pass assistant features on the `ai-smart-import` branch.

## Missing player confirmation

`add_new_player_suggestion` is now apply-able from the assistant action card. It is still a deliberate user tap, not automatic roster mutation.

Behavior:

- If the AI finds an unknown name such as `Kira`, it can show an `Add player` action card.
- Tapping the card adds the player to the current roster.
- The new player is marked as new and selected for Today.
- If the name already exists, Fair Teams selects the existing player instead of duplicating them.
- If the action includes a suggested skill, that skill is used as the simple first rating; otherwise skill defaults to 5.

## Push-to-talk voice

The assistant panel now has a `Voice` button.

Flow:

1. Tap `Voice`.
2. Speak naturally.
3. Tap `Done`.
4. The browser records a short audio clip.
5. `/api/ai-voice-transcribe.js` transcribes it using OpenAI.
6. The transcript is inserted into the text box and sent through the same `/api/ai-smart-command` assistant route.

This intentionally avoids realtime voice for now. The goal is a stable, cheap, debuggable first voice command layer.

## Env

The voice route reuses:

- `OPENAI_API_KEY`
- `AI_SMART_COMMAND_SERVER_ENABLED`
- `AI_SMART_COMMAND_ALLOWED_BRANCH`

Optional:

- `OPENAI_VOICE_TRANSCRIBE_MODEL` defaults to `gpt-4o-mini-transcribe`.

## Safety

No destructive actions are added. Voice input uses the same safe assistant action cards as typed input.

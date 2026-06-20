# AI Smart Command Conversation Layer

This patch changes the beta from a strict command parser into a lightweight Fair Teams assistant.

## Behavior

- User messages now go to the AI backend by default, including greetings and simple questions.
- The assistant replies naturally in `assistantSummary`.
- Fair Teams app requests still return structured safe actions underneath the assistant message.
- Conversation-only messages return no actions and no technical error.
- Live/current outside data such as weather is not connected yet, so the assistant should say so rather than inventing information.
- The UI now shows the assistant message first and keeps technical action details secondary.

## Product rule

The assistant can talk, but Fair Teams only applies actions from the capability registry. Destructive or unwired actions remain protected.

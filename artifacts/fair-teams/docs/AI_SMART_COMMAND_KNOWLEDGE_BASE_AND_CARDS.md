# AI Smart Command Knowledge Base + Action Cards

This patch moves Fair Teams Assistant from a generic conversational parser toward an app-aware assistant.

## Added

- `api/fair-teams-knowledge.js`
  - Compact Fair Teams source-of-truth sections.
  - Topic detection for ratings, local/shared rosters, Today/Teams, Smart Import/OCR, Club Notes, Equipment, backup/sync, voice/AI, and safety.
  - Only relevant sections are sent to OpenAI for each command/question.

- `api/ai-smart-command.js`
  - Sends `fairTeamsKnowledge` with each request.
  - Stronger instruction: Fair Teams product questions must be answered from the knowledge base, not from generic sports-app assumptions.
  - If a detail is not known, assistant should say it does not have that Fair Teams detail yet.

- `src/components/AiSmartCommandPanel.tsx`
  - Makes the response feel more like assistant + action cards.
  - Action cards are visually separated by status: can apply, needs confirmation, preview only, not wired yet, protected.
  - Button labels are more action-specific, for example `Add note` instead of generic `Apply`.

- `docs/ai-command-tests.json`
  - Adds Fair Teams product Q&A tests for local/shared rosters, Lost & Found, Equipment Board, and Cloud Backup vs shared collaboration.

## Design

The assistant now has two different jobs:

1. **Answer Fair Teams questions** from a compact knowledge base.
2. **Return safe app actions** through the capability/action framework.

This prevents generic answers like generic sports-rating explanations when the user is asking about Fair Teams-specific rating behavior.

## Still not included

- Real voice recording/transcription.
- Applying most Today/team actions.
- Real equipment movement from AI.

Those should come after the assistant reliably understands the app.

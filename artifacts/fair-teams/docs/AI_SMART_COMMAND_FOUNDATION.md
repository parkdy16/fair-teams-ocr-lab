# Fair Teams AI Smart Command Foundation

This is the first safe foundation for the `ai-smart-import` branch.

## What this adds

- `api/ai-smart-command.ts`
  - Server-side OpenAI Responses API route.
  - Disabled unless `AI_SMART_COMMAND_SERVER_ENABLED=true`.
  - Optional branch guard via `AI_SMART_COMMAND_ALLOWED_BRANCH=ai-smart-import`.
  - Uses Structured Outputs JSON schema.

- `src/lib/aiSmartCommandTypes.ts`
  - Shared TypeScript action schema.
  - Language-independent enums.
  - Multilingual command result types.

- `src/lib/aiSmartCommandClient.ts`
  - Frontend helper for calling `/api/ai-smart-command`.
  - Cleans roster data before sending.

- `src/components/AiSmartCommandPanel.tsx`
  - Hidden beta UI panel.
  - Only appears when `VITE_ENABLE_AI_SMART_COMMAND=true`.
  - Text-command test first; no roster mutation yet.

## Multilingual behavior

The server prompt is designed to understand English, German, Korean, and mixed language.
The app action schema stays the same regardless of the spoken language.
Player names are preserved and not translated.

Examples that should parse:

- `Sarah and Tommy don't like each other. Keep them apart.`
- `Sarah und Tommy bitte nicht zusammen.`
- `Sarah랑 Tommy는 같이 두지 마.`
- `George red, 6v6, make teams.`
- `조지는 빨강팀, 6대6으로 팀 만들어줘.`
- `Bitte einen guten Verteidiger in jedes Team.`

## Required environment variables

Preview / branch only:

```env
OPENAI_API_KEY=sk-...
AI_SMART_COMMAND_SERVER_ENABLED=true
AI_SMART_COMMAND_ALLOWED_BRANCH=ai-smart-import
OPENAI_SMART_COMMAND_MODEL=gpt-4o-mini
VITE_ENABLE_AI_SMART_COMMAND=true
```

Production/main should stay disabled:

```env
AI_SMART_COMMAND_SERVER_ENABLED=false
VITE_ENABLE_AI_SMART_COMMAND=false
```

## Integration step still needed

Import and place `<AiSmartCommandPanel />` only in a hidden test area, probably Club tab or Roster Tools developer section.

Example:

```tsx
<AiSmartCommandPanel
  players={players}
  rosterName={activeRosterName}
  rosterMode={activeRosterIsFirebaseShared ? "shared" : "local"}
  activeTab={activeTab}
  onParsed={(result) => console.log("AI command result", result)}
/>
```

Do not let AI mutate rosters or teams yet. First test parsed actions only.

## Next patch after this

1. Wire the hidden panel into the current source.
2. Add a local action preview modal.
3. Apply safe actions one by one:
   - select existing players
   - set 6v6 / players per team
   - add keep together / keep separate rule
   - lock player to team color
4. Add voice recording after text parsing works.

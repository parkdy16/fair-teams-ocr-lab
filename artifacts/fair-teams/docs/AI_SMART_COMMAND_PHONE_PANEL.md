# AI Smart Command phone test panel

This patch wires the existing `AiSmartCommandPanel` into the Club tab behind the existing `VITE_ENABLE_AI_SMART_COMMAND` feature flag.

Behavior:
- The panel appears only when `VITE_ENABLE_AI_SMART_COMMAND=true`.
- It sends typed commands to `/api/ai-smart-command`.
- It previews structured AI actions only.
- It does not modify the roster, pairing rules, Today selections, or generated teams yet.

Preview environment variables needed:

```env
OPENAI_API_KEY=...
AI_SMART_COMMAND_SERVER_ENABLED=true
AI_SMART_COMMAND_ALLOWED_BRANCH=ai-smart-import
OPENAI_SMART_COMMAND_MODEL=gpt-4o-mini
VITE_ENABLE_AI_SMART_COMMAND=true
```

Production/main should keep AI disabled:

```env
AI_SMART_COMMAND_SERVER_ENABLED=false
VITE_ENABLE_AI_SMART_COMMAND=false
```

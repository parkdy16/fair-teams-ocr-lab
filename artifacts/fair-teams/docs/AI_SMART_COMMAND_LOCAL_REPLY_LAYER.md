# AI Smart Command Local Reply Layer

This patch adds a cheap local reply layer before `/api/ai-smart-command`.

Purpose:

- Greetings such as `hey there`, `hello`, `안녕하세요`, `hallo` are answered locally.
- Help requests such as `what can you do?`, `help`, `도움` are answered locally.
- Thanks/dismissal messages are answered locally.
- These local replies do not call the OpenAI backend, so they do not spend API usage.

Real app commands still go through the AI command route, for example:

- `select all players and make 6 teams`
- `Sarah and Tommy don't like each other`
- `add a Club note saying bring two balls`
- `change roster color to navy`

The UI labels local replies as `Local reply — no AI call used` so testers can see when the command did not use API.

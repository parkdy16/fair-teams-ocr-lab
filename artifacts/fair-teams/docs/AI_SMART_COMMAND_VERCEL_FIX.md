# AI Smart Command Vercel build fix

Vercel compiles `/api/*.ts` serverless functions separately from the local Vite app build. If deployment fails with:

```text
api/ai-smart-command.ts: Emit skipped
```

use the JavaScript serverless route instead:

```text
api/ai-smart-command.js
```

Then remove the TypeScript route from git:

```bash
git rm artifacts/fair-teams/api/ai-smart-command.ts
```

The frontend can keep calling `/api/ai-smart-command`; Vercel routes the same URL to the `.js` function.

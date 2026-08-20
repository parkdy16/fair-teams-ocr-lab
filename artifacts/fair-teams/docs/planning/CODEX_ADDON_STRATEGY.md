# Stripes Codex-Compatible Add-on Strategy

Planning checkpoint: 2026-08-20

## Purpose

Continue researching external developer/design tools that can materially
improve Stripes quality, reduce iteration, expose authoritative runtime/service
context, or reduce premium Codex credit use.

The user is encouraged to personally learn useful tools during the remaining
development period.

Tool research must remain bounded. The tooling itself must not become another
project.

## Compatibility requirement

Prefer tools Codex can use directly through:

- Codex plugins;
- MCP;
- Codex/agent skills;
- vendor-supported CLI tools Codex can invoke.

Avoid making repeated manual copy/paste between unrelated AI systems a normal
development dependency.

Prefer official vendor integrations when available.

## Adoption rule

For every candidate tool:

1. identify the concrete Stripes problem;
2. personally inspect what the tool actually offers;
3. run one bounded pilot;
4. compare quality/time/credit cost with the current workflow;
5. keep the tool only when the value is meaningful.

Do not expose every installed integration to every task.

Use least privilege/read-only modes where practical.

Tool connectivity never authorizes Codex to deploy, modify production data,
change IAM, send production communication or bypass existing Stripes safety
rules.

## Priority A — 21st.dev

Status: APPROVED FOR DESIGN EXPLORATION / PILOT USE.

Direct agent/Codex-compatible access exists.

Primary Stripes value:

- design/component pattern research before production coding;
- alternative interaction/layout exploration;
- File Cabinet Explorer/Finder-style UX;
- Live Split interaction design;
- final cross-app UI review.

Policy:

- use it to explore/reference;
- product decisions remain ours;
- Codex adapts approved ideas into the existing Stripes component/design/i18n
  system;
- do not import a second visual language merely because a component is trendy.

## Priority A — Chrome DevTools for agents

Status: HIGH-PRIORITY EVALUATION.

Official direct Codex MCP support exists.

Potential value:

- inspect a running Stripes browser session;
- real runtime/DOM/network/console debugging;
- mobile/responsive emulation;
- accessibility audit;
- Lighthouse SEO audit;
- performance/Core Web Vitals review;
- systematic final UI verification;
- inspection of authenticated flows when using an explicitly approved browser
  session.

Pilot before the final UI/SEO phase.

## Priority A — Firebase Codex plugin + agent skills + MCP

Status: HIGH-PRIORITY EVALUATION.

Official Firebase Codex support exists.

Potential value:

- current Firebase best-practice context;
- Firestore/Auth/Rules/project awareness;
- Firebase-specific implementation guidance;
- reduced generic documentation/context overhead;
- emulator/review assistance.

Safety:

- prefer emulator/inspection work during development;
- production writes and deployment remain explicitly gated;
- MCP access is not permission to change production data, Auth users, IAM or
  cloud resources.

## Priority B — Figma MCP

Status: HIGH-POTENTIAL OPTIONAL PILOT.

Official Codex/Figma MCP support exists.

Potential workflow:

running Stripes UI
-> editable Figma design
-> visual exploration/refinement
-> deliberate approval
-> Codex implementation.

Potentially useful for:

- controlled final app-wide UX/UI reconsideration;
- difficult new interaction design;
- component/design-system consistency;
- moving a live browser UI into editable design context.

Pilot on one screen before making Figma part of normal development.

Check account/seat/usage limits before relying on it.

## Priority B — Context7 or equivalent current-doc MCP

Status: LOW-RISK EVALUATION.

Potential value:

- current version-specific third-party API/library documentation;
- reduce reasoning based on stale training knowledge.

Use only where repository code does not already establish the relevant external
contract.

## Priority B — existing Playwright + agent/browser skills

Stripes already has Playwright regression infrastructure.

Prefer building on that investment.

Potential value:

- browser-flow investigation;
- screenshots;
- regression generation;
- repeatable UI checks.

Do not duplicate the existing browser-smoke system without a clear advantage.

Prefer lightweight CLI/skills when they provide the required information more
efficiently than a large always-on MCP surface.

## Priority C — release/service integrations

Evaluate only when useful:

- Vercel integration for production deployment/log diagnosis;
- Resend integration for final transactional-email verification;
- GitHub integration for direct Actions/workflow inspection;
- Sentry or equivalent runtime monitoring as a launch/post-launch reliability
  decision.

Keep permissions narrow.

## Design workflow

For a major new surface:

1. product behavior/spec first;
2. external design/reference exploration where valuable;
3. choose a direction;
4. Codex implements the approved design using Stripes architecture;
5. inspect the actual runtime result.

Use this specifically for Live Split and File Cabinet.

Do not redesign already-settled interactions merely because a new tool exists.

The current Special Abilities / Player Vibe interaction is an example of an
approved UI that should remain stable.

## Final UI workflow

At feature freeze:

1. create a systematic screen/state inventory;
2. use Chrome/browser tooling for mechanical responsive/accessibility/runtime
   inspection;
3. use 21st/Figma selectively for comparative design exploration;
4. use human/ChatGPT product judgment to decide what actually needs changing;
5. classify Keep / Polish / Restructure / Redesign;
6. implement only approved batches with Codex;
7. verify regressions and real-device behavior.

## Tool-research checkpoint

Before each major production package, briefly ask:

- Is there a new direct Codex-compatible tool that materially helps this task?
- Does it provide authoritative context we otherwise lack?
- Can it reduce implementation iterations?
- Can it reduce premium Codex usage?
- Is its access/security surface justified?

This should be a short habit, not continuous tool chasing.

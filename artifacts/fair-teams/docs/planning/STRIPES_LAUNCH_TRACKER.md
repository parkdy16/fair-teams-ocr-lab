# Stripes Launch Execution & Credit Tracker

Planning checkpoint: 2026-08-20

This is the operational companion to `STRIPES_ROADMAP.md`.

The roadmap owns product and architecture direction.
This file owns launch progress, credit/runway observations and execution
planning.

## Launch target

Working targets:

- feature-complete target: approximately 2026-09-15;
- controlled final UX/UI and real-device verification immediately afterward;
- meaningful buffer before the 2026-09-30 store-launch deadline.

Scope must be controlled to preserve the buffer.

## Current released / established foundations

Major foundations already established include:

- G2 core Google / Cabinet closure;
- G3 provider-neutral File Cabinet resource/index foundation;
- H1 preventive engineering rails;
- H2 architecture/data safety;
- I1 English-only internationalization foundation.

Recent team-engine checkpoints:

- `01fdcc9` — H3 team-generator safety baseline;
- `58299ba` — H3 isolated fairness experiment harness.

H3 protects safety without freezing the legacy weighted-skill formula as the
future definition of fairness.

## Last known credit snapshot

User-reported planning state on 2026-08-20:

- normal/main Codex: approximately 10% remaining before the next renewal;
- Spark weekly: approximately 30% remaining;
- Spark five-hour window: last reported exhausted immediately before its
  20:31 reset; re-check the live meter before attributing later Spark usage;
- next known broader renewal: 2026-08-25.

These values are manual observations, not an API-backed usage ledger.

Do not invent exact per-task cost when several jobs occurred between meter
readings or a reset occurred between observations.

## Credit-use lessons so far

Recent development demonstrated:

- repo-wide architecture migrations such as I1 can consume substantial premium
  Codex capacity;
- broad multi-agent Spark jobs can consume the short five-hour allowance very
  quickly;
- bounded inspection/test jobs are a much better Spark fit;
- product/math/UX decisions should normally be settled before expensive Codex
  implementation;
- strong Codex should spend most of its capacity implementing a prepared
  production package rather than rediscovering requirements.

Historical task-by-task percentages cannot be reconstructed reliably from the
available meters. Begin precise tracking from this checkpoint forward.

## Remaining launch packages — planning estimate

These are budgeting ranges, not guarantees.

| Package | Launch scope | Approx. strong-Codex equivalent |
| --- | --- | ---: |
| T1 player model + normal generator | OVR-first model, Football v2 profile, production generator migration | 0.40–0.60 cycle |
| Match format + Live Split | unequal-on-field handling, Live Split engine + production UX | 0.30–0.45 cycle |
| File Cabinet usable UX | restrained Explorer/Finder-style virtual organization | 0.10–0.15 cycle |
| SEO + ASO | public technical SEO + store optimization | 0.03–0.06 cycle |
| Final controlled UX/UI pass | systematic audit + approved cross-app improvement | 0.30–0.50 cycle |
| Launch corrections | production/store/device issues | 0.05–0.10 cycle |

Raw implementation estimates do not include every integration/review/fix loop.

Planning assumption including integration and contingency:

- approximately 1.7–2.3 full strong-Codex cycles remain;
- three available full cycles provide useful contingency if launch scope remains
  controlled.

Recalculate after meaningful production packages.

## Three-cycle launch plan

### Cycle 1

Primary goal:

- T1 player-model foundation;
- new normal Generate evaluator/engine.

### Cycle 2

Primary goal:

- match format;
- unequal-number handling;
- Live Split engine;
- Live Split UX/UI.

### Cycle 3

Primary goal:

- File Cabinet usable UX;
- SEO/ASO;
- remaining launch-critical work;
- controlled app-wide UX/UI reconsideration;
- launch/store/device corrections.

The exact boundary between cycles may move.
The total launch runway matters more than forcing packages into arbitrary weeks.

## Final UX/UI budget

The final design pass is allowed to be more than tiny polish.

Much of Stripes' UX/UI was developed before the current Codex workflow and
before discovering direct design/audit tooling.

After feature freeze, perform a controlled app-wide reconsideration.

Planning budget:

- reserve roughly 30–50% of the final strong-Codex cycle;
- spend less if the finished app is already cohesive;
- allow up to one full cycle only if genuinely valuable redesign opportunities
  remain and launch schedule/credit runway still support them.

This is not permission for an uncontrolled visual rewrite.

## Design early, audit late

For major new UI:

1. define the product behavior first;
2. inspect good patterns/references before coding;
3. use 21st.dev and other approved design tooling when helpful;
4. deliberately choose a direction;
5. give Codex the approved visual/interaction target;
6. implement once using existing Stripes components/tokens/i18n;
7. review the running result.

Especially apply this to:

- Live Split;
- File Cabinet Explorer/Finder-style UX;
- other genuinely novel interaction surfaces.

Do not add this overhead to ordinary forms, tiny controls or settled UI.

After feature freeze:

1. systematic mobile-first screen inventory;
2. separate desktop/tablet review where meaningful;
3. automated/systematic accessibility/responsive/consistency review;
4. human/ChatGPT product review;
5. classify findings as Keep / Polish / Restructure / Redesign;
6. approve changes before coding;
7. batch related fixes through Codex;
8. rerun regression and real-device checks.

## Credit logging protocol

Append one row after meaningful agent work.

| Date | Package/task | Engine | Effort | Start meter | End meter | Approx. burn | Result/commit |
| --- | --- | --- | --- | --- | --- | --- | --- |

Rules:

- compare the same usage meter/window;
- if a reset occurs, begin a new accounting window;
- distinguish main Codex, Spark weekly and Spark five-hour usage;
- when several tasks occurred between observations, log aggregate burn instead
  of fabricating task-level precision;
- inspection/research should normally use chat or bounded Spark;
- strong Codex should normally implement prepared interconnected production
  work.

## Minimal check-in format

The user can report:

`checkpoint: normal <x>%, Spark weekly <y>%, Spark 5h <z>%, commit <hash/status>`

At each checkpoint reassess:

1. roadmap progress;
2. observed credit burn;
3. projected remaining cycles;
4. launch-date risk;
5. recommended next engine/task;
6. scope that should leave launch if runway deteriorates.

## Scope-control rule

As feature-complete approaches, adding launch scope should normally displace
comparable scope rather than silently consuming contingency.

Priority order:

1. core team-generation quality;
2. Live Split;
3. usable existing Club/Cabinet functionality;
4. reliability;
5. coherent UX;
6. SEO/ASO/discovery.

Full multisport breadth remains post-launch unless explicitly reprioritized.

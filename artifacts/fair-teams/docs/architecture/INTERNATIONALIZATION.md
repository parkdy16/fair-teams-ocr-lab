# Stripes internationalization

I1 establishes the language architecture while Stripes ships only English.
Translation into German, Korean or another language is I2 work. The canonical
English wording remains product behavior and is bundled with the application;
no catalog is fetched at runtime.

The 2026-08-20 I1 implementation and requested local verification are complete
in the worktree. This document does not claim a commit, hosted CI run or
release.

## Frontend architecture

The frontend uses `i18next` with `react-i18next`:

- `src/i18n/i18n.ts` creates the synchronous application instance;
- `src/i18n/react.tsx` provides it to every app and public-page root;
- `src/i18n/locales.ts` owns locale resolution and local persistence;
- `src/i18n/format.ts` owns the shared `Intl` formatting helpers;
- `src/i18n/resources/en.ts` composes the canonical English catalog from the
  feature files in `src/i18n/resources/` and rejects duplicate keys.

Catalog segments are an editing boundary, not separate runtime namespaces.
Use semantic, feature-oriented dotted keys such as
`club.fileCabinet.addFromDrive`. Do not use an English sentence as its own key.
Prefer one key for a complete sentence or meaningful label; do not split
punctuation or ordinary sentence fragments merely to wrap an interpolated
value. Repeated product terms belong in `common.ts` only when their wording and
meaning are genuinely identical on every surface.

React components should normally call `useStripesTranslation()`. A pure
presentation helper that cannot use React may call `translate()`. The
application root subscribes to language changes so framework-neutral helpers
are recalculated, but memoized derived presentation must still include the
resolved locale in its dependencies or be calculated on each render.

The typed `translate()` path validates canonical keys and fails loudly when a
key is absent; React catalog calls are constrained to `TranslationKey` at
compile time. English is also the fallback locale, so an unsupported or
incomplete future locale cannot expose raw keys through those supported paths.

## Locale resolution and persistence

`SUPPORTED_UI_LOCALES` is the single frontend allowlist. The current list is
only `en`. Resolution order is:

1. a valid value in local storage under `stripes-ui-locale-v1`;
2. the first supported language from `navigator.languages` or
   `navigator.language`;
3. canonical English.

Language-region and underscore variants normalize to their supported base
language. Unsupported, malformed or inaccessible stored values fail safely to
the next source. The resolved locale is reflected in `<html lang>`.

`index.html` and `public/manifest.webmanifest` retain canonical English as
static pre-bootstrap, crawler and install metadata. They cannot consume the
bundled runtime catalog, so they are a deliberate bounded exception to the JSX
policy rather than a second translation source for application UI. I2 must
choose the deployment strategy for localized crawler/install metadata (for
example locale-specific entry documents/manifests) before adding non-English
values; the static English fallback must remain usable before JavaScript boots.

Locale preference is device-local. It is not stored in Firebase, attached to
workspace membership or used in authentication/authority decisions. Do not add
a visible selector while only English is available.

To add a future locale, add it to the allowlist, supply and review a complete
bundled catalog, register that catalog in the i18next resources, add fallback
and missing-key tests, and run responsive/typography review for that language.
That is an I2 release task, not permission to ship partial machine translation.

## Interpolation, plurals and formatting

Use named interpolation values:

```ts
t("roster.messages.playerAdded", { player: player.name })
```

Use i18next's `count` option and `_one` / `_other` entries for count-sensitive
language. Do not construct plurals with `count === 1 ? "" : "s"` in new UI.
The canonical catalog keeps a base entry as a discoverable English fallback.
Render visible catalog counts with `{{count, number}}` (and apply the same
number formatter to secondary numeric totals); the numeric `count` option still
selects the plural form. Keep technical dimensions such as `5v5` raw.

Use the helpers in `src/i18n/format.ts` for locale-sensitive numbers,
percentages, dates/times and lists. Pass the resolved UI locale; never modify
the stored timestamp or number for presentation. Raw protocol values, IDs,
machine timestamps and interchange-format fields remain unformatted where the
format contract requires them.

## Content boundaries

Catalog Stripes-authored product language, including labels, headings,
accessibility text, help, empty states, confirmations and safe fallback
messages. Do not translate or reinterpret:

- player, roster, Club Note, Action Board, equipment or other user-entered
  content;
- external URLs, Google file names or provider-authored error text;
- model-generated assistant prose, transcripts or the user's command;
- CSS classes, test IDs, API/provider codes, diagnostic codes or log text;
- Firestore fields, role/status/channel enums or other persisted machine values;
- JSON/CSV/Google Sheet keys, tab names, import tokens and other interchange
  schema.

When a system default later becomes editable/persisted content, translate the
creation/reset source only when the text is not also a compatibility or
control-flow sentinel. Never translate an already-saved value on read. Keep raw
canonical defaults separate from translated display labels whenever a label
participates in persistence or compatibility matching; canonical starter names
such as `New roster` remain stable in storage and are translated only when
presented.

Firebase shared-workspace summaries carry unpersisted `nameSource` provenance
for missing-name compatibility fallbacks. Presentation adapters catalog only a
value marked `fallback`; an identical real stored group or roster name remains
user content and passes through unchanged. The canonical `My Stripes group` and
`Shared roster` domain defaults therefore stay locale-neutral when written.

Action Board schedule-host claims currently write `Hosted by …` into the
editable, durable decision `outcome` field, and existing cards render that field
as user-editable content. I1 preserves that storage contract. I2 must decide on
a structured system-outcome representation plus legacy-card compatibility
before localizing this generated prefix; translating it at write time would
persist the writer's UI locale for every collaborator.

AI conversation language remains a distinct generated-language boundary in
I1. The existing browser/input-language behavior is preserved; the English UI
locale must not silently force user or model prose to English. I2 must choose
that product policy deliberately.

Deterministic local-assistant and trust-guard prose therefore uses the explicit
framework-neutral `canonicalAiSmartCommandConversationPresenter`, whose I1
authority is canonical English. Its list and number formatting uses the
presenter's conversation locale, never the resolved UI locale. UI chrome such
as capability/status labels, buttons, headings and accessibility text continues
to use the UI translator. A future UI locale change alone must not change local
assistant summaries, interpreted-action reasons, clarifications or
roster/app-knowledge answers; I2 may inject another conversation presenter only
after approving a conversation-language policy.

AI action matching continues to prefer stable capability IDs, action types,
structured distribution markers and trust-guard message IDs. Narrow English
reason/intent regexes remain only as documented compatibility fallbacks for
older or provider responses that predate those structures; current I1 local
conversation text is not control data.

## Domain and provider messages

Security decisions and durable state use stable codes, not localized text. For
new or migrated boundaries, return an allowlisted status/reason plus structured
arguments, then map it to a catalog key in the UI. Keep an established English
`Error.message` fallback where changing a mature service contract would add
risk. Never use H2 diagnostic codes or raw provider messages as translation
keys, and never weaken fail-closed behavior to obtain translated output.

I1 deliberately does not rewrite every mature `Error` in the repository. The
current high-value boundaries demonstrate the incremental pattern:

- active shared-workspace authority statuses/issues map to catalog presentation
  without changing membership or capability calculation;
- shared-roster autosync statuses, block reasons and failure reasons map in the
  UI while preserving the mature raw-message compatibility fallback;
- File Cabinet provider-resolution reasons map separately from provider-owned
  file names, messages and codes;
- email-verification reasons and structured resend countdown data map to UI
  text without changing Firebase verification authority;
- known Google-auth reasons map to catalog keys, while the intentionally broad
  `unavailable` reason preserves its mature English compatibility message until
  the domain exposes narrower stable reasons;
- AI capability metadata uses semantic catalog keys, deterministic local-router
  presentation uses the framework-neutral translator, and the AI truth guard
  accepts stable message IDs through an injected catalog presenter. User
  commands, transcripts and model-generated prose remain outside this contract.

Future work should extend stable operation-scoped reasons rather than
introducing new final-English domain contracts. None of these presentation
adapters may feed localized text back into persistence, security or authority
decisions.

## Firebase Functions

Firebase deploys `functions/` independently, so backend language uses the
small CommonJS adapter and catalog under `functions/i18n*`; it does not import
the React/frontend bundle. Current verification, invitation,
organizer-joined, and Action Board email/push templates use that catalog while
preserving their English output, escaping, URLs, senders, headers and delivery
behavior.

There is no authoritative recipient locale in I1. Backend locale resolution is
allowlisted and defaults to English. Do not infer locale from an email address,
domain or name, and do not use a browser's local preference for another
recipient. I2 must choose an explicit authoritative locale source before
sending recipient-specific localized system messages. Privacy-safe diagnostic
events and provider codes remain machine-only.

## Prevention and tests

`npm run check:i18n` runs an AST-based zero-baseline policy over live outer
production JSX/TSX. It rejects high-confidence literal render text and common
presentation attributes while ignoring the stale tree, tests, technical
attributes and dynamic user data. A true technical/provider exception may use
an immediately adjacent `i18n-exempt -- <substantive reason>` comment; broad or
reasonless exemptions are invalid.

The checker intentionally does not attempt noisy whole-program data-flow
analysis. Reviewers must still inspect status builders, option metadata,
canvas/export output and service-to-UI message boundaries. The Core Regression
Gate runs the policy, i18n unit tests and build; the companion browser gate runs
the unsupported-locale fallback smoke.

For new user-facing work:

1. classify each string as Stripes-authored, user/provider-generated, machine
   data or developer-only;
2. add semantic canonical English keys for Stripes-authored presentation;
3. use named interpolation, plural rules and shared `Intl` helpers;
4. preserve stable stored values and translate only their presentation;
5. add focused tests for new locale/status behavior;
6. run `npm run check:i18n`, `npm run typecheck:live` and the relevant Core or
   browser gates.

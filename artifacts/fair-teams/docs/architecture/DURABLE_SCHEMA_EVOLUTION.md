# Durable schema evolution

This document defines the forward-looking schema contract for new durable
Stripes documents. It does not retroactively declare every existing
`schemaVersion` field to be an enforced reader contract.

## Convention for new durable documents

Every new durable document shape must have a co-located schema contract before
production data is written. The contract must state:

- one positive-integer current `schemaVersion`;
- every historical version the reader still supports;
- whether a missing `schemaVersion` is rejected or maps to one named historical
  version.

Writers emit only the current version. Readers resolve the version first, then
use an explicit version-specific parser or adapter to produce the current
domain model. A missing, malformed, retired or future version must not be
silently interpreted as the current shape.

`schemaVersion` describes document shape and meaning. It is distinct from a
content revision, optimistic-concurrency counter or timestamp. In particular,
the shared roster's `version` field remains its save-conflict revision and is
not a schema version.

Supported historical shapes remain read-compatible until an explicit decision
retires them. Shape conversion must be pure at read time unless a separately
approved migration is required. A migration must be bounded, idempotent,
reviewable and covered by backup/restore preparation. It must not
opportunistically rewrite authentication, membership, ownership or other
authority fields.

Firestore rules may require the current version for new writes when that is
compatible with the rollout. Rules must not strand supported historical data;
reader support, write rollout and any migration have to be reviewed together.

Tests for each new durable schema must cover:

- the current write and read shape;
- every supported historical version and its normalization;
- the explicit unversioned policy;
- malformed, retired and future versions;
- any security-rule constraints on client-writable documents.

## Reusable live-source seam

`src/lib/durableSchema.ts` resolves only the version decision. Its contract
requires `currentVersion`, `supportedVersions` and `unversionedVersion`, and its
result distinguishes supported, missing, invalid and unsupported versions.

The resolver deliberately does not parse document fields, migrate data, write
back a newer shape or choose a fallback. Those decisions stay beside the
document-specific model where reviewers can see the supported history.

The File Cabinet location was the first existing adopter. It continues to
accept only schema version 1 and to reject missing or future versions with the
same runtime behavior and user message as before. The separate G3 File Cabinet
resource/index contract also starts at strict version 1: its writer emits only
that shape, its reader has no unversioned fallback, and malformed or future
records fail closed rather than being interpreted as current resources.

## Existing durable-shape inventory

The following is the current behavior, not a promise that all listed version
numbers are already enforced contracts.

| Surface | Current writes | Current reader behavior |
| --- | --- | --- |
| `sharedGroups/{groupId}` | Version 2 | Compatibility parser accepts older or unversioned field sets; it does not dispatch on `schemaVersion`. |
| `sharedRosters/{rosterId}` | Version 2 | Compatibility parser accepts historical field sets; `version` separately controls optimistic save conflicts. |
| Cabinet `cabinet/config` | Version 1 | Strict version and field validation in the live client and Firestore rules. |
| G3 Cabinet `cabinetResources/{resourceId}` | Version 1 | Strict provider/reference, origin/context and attribution parsing; missing, malformed and future versions are rejected. Group scope is primary, with the same contract only for genuinely standalone shared rosters. |
| Action Board config/cards | Version 7 | Compatibility parser adapts legacy vote, action, assignee and timestamp mirrors without version dispatch. |
| Action Board columns | Version 4 | Compatibility parser reads the current fields without version dispatch. |
| Equipment bags | Version 4 | Compatibility parser supports legacy `contents` and current structured `items` without version dispatch. |
| Attendance issues | Version 1 | Shape-based compatibility parser; warning-template sentinel documents use version 2 in the same collection. |
| Club rating submissions and summaries | Version 2 | Compatibility logic derives missing profile and aggregate fields from older skill/average data. |
| Club notes | Version 1 | Shape validation only; no version dispatch. |
| Legacy Club resources `sharedRosters/{rosterId}/resources` | Version 1 | Transitional Action Board/Firebase Storage compatibility reader validates resource type/context but does not dispatch on version. It is intentionally isolated from the strict G3 Cabinet index until a separately approved G4 migration. |
| Trusted invitation, closure and governance documents | Versions 1 or 2 by document kind | Server helpers validate operational invariants, while most recovery and governance readers do not dispatch on `schemaVersion`. Shared-roster creation request version 1 is checked strictly on replay. |

## Current limitations and non-goals

- This convention does not migrate or rewrite existing production data.
- It does not add strict version rejection to mature compatibility readers.
- Firestore currently enforces an exact `schemaVersion` for the Cabinet
  configuration and G3 Cabinet resource schemas. Other mature compatibility
  readers have not been opportunistically tightened.
- The live resolver is an outer-frontend TypeScript module. Firebase Functions
  remain CommonJS and must use an explicit server-side version switch, or a
  small equivalent helper when a new server-owned durable schema requires one.
- Existing Google Sheet, Drive backup, local-storage and import compatibility
  formats are unchanged.
- The stale `src/src/` tree is intentionally untouched.
- Privacy-safe diagnostic logging, migrations and production data inspection
  remain separate concerns; the H2 diagnostic rail does not make them the
  responsibility of this version resolver.

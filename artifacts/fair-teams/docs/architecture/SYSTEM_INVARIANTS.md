# Stripes System Invariants

These are durable architecture and safety constraints for Stripes.

They are not a feature roadmap. They describe properties future implementation
must preserve unless an explicit architecture decision deliberately replaces an
invariant and updates this document, STRIPES_ROADMAP.md and relevant regression
coverage together.

Codex must read this document before security, persistence, schema,
cross-cutting architecture, shared-workspace authority, Google integration or
team-engine changes.

## 1. Shared-workspace authority

- Shared-workspace authority must come from the approved capability/authority
  model, not from UI visibility or legacy owner assumptions.
- `owner`, `editor` and `organizer` are organizer-class roles where the current
  compatibility model requires them.
- Legacy `ownerUid` compatibility must never create conflicting or superior
  permanent workspace authority.
- Protected membership, invitation, organizer removal and workspace closure
  mutations must use their approved trusted paths.
- UI code must not recreate protected authority rules independently.

## 2. Roster/group linkage

- The live shared roster is authoritative for its workspace/group linkage.
- A linked roster and group must remain mutually consistent.
- Group `rosterIds` and roster `groupId` must not silently diverge.
- New code must fail closed when authoritative linkage is malformed or
  inconsistent.
- Historical compatibility must never permit new unsafe linkage.

## 3. Equal-organizer governance

- Normal organizers have equal operational workspace authority unless an
  explicitly approved governance rule says otherwise.
- One organizer leaving must not delete or orphan the shared workspace.
- Removing another organizer remains a protected governance action.
- Whole-workspace closure is distinct from ordinary editing or leaving.

## 4. Firebase identity and Google identity

- Firebase/Stripes identity and Google Drive authorization are separate.
- Connecting, disconnecting or changing a Drive account must not silently change
  Firebase identity or Stripes workspace authority.
- Stripes must not assume that a Firebase organizer automatically has Google
  file access.
- Google remains authoritative for Google file/folder permissions.

## 5. Google OAuth and Drive privacy boundary

- Approved Drive scope remains `drive.file` unless a future explicit security
  review approves broader scope.
- Do not persist Google access tokens or refresh tokens in Firestore,
  localStorage, URLs, logs or ordinary application data.
- Do not build a duplicate Stripes Google-file ACL.
- User-driven Picker/approved per-file authorization remains the preferred way
  to expose existing Google resources to Stripes.
- Shared Drive support must not silently broaden OAuth scope or enumerate
  resources beyond the approved architecture.

## 6. External Google resource preservation

- Changing or removing a Stripes Cabinet relationship must not silently delete,
  move or modify the previous Google folder/files.
- File Cabinet resource records contain Stripes metadata and stable external
  references only. Removing an index entry or one of its Stripes contexts must
  not delete, trash, move, copy or re-permission the provider resource.
- The flat `cabinetResources` collection is the workspace resource registry.
  Origin records where an item entered Stripes; contexts record current feature
  relationships. Removing one context updates that relationship rather than
  deleting the registry record. Generic Cabinet-level whole-record removal is a
  separate explicit metadata action and must fail while an Action Board or
  Equipment origin/context still needs the record. The owning feature must
  remove its relationship first.
- A recorded provider resource ID is authoritative. Live availability and
  permission state must be re-read from the connected provider and must not be
  persisted as durable capability truth or satisfied by substituting another
  resource.
- Stripes metadata replacement is not Google resource deletion.
- Destructive operations affecting external Google resources require a separate
  explicit product/security decision.

## 7. Cabinet location authority

- Recorded Cabinet folder/drive identity is authoritative once configured.
- Rename/move must preserve continuity through stable Google IDs.
- Missing, revoked or unavailable resources must fail closed rather than
  silently switching to another folder.
- A collaborator may authorize an already-recorded Cabinet without becoming its
  creator/host.
- Creating/hosting a Cabinet and accessing an existing shared Cabinet are
  separate concepts.

## 8. Persistence and schema evolution

- The forward convention is defined in
  `docs/architecture/DURABLE_SCHEMA_EVOLUTION.md`.
- New durable document shapes use a positive-integer `schemaVersion`, and each
  reader must explicitly name its current, supported historical and
  unversioned-legacy policy.
- New durable schemas must have an explicit evolution/versioning strategy before
  incompatible production shapes are introduced.
- Readers must handle supported historical shapes deliberately.
- Missing, malformed or unknown future versions must fail closed when no
  explicit compatibility parser makes them safe.
- A content revision such as the shared roster's optimistic-concurrency
  `version` is not a schema version.
- Migrations must be explicit, bounded and independently reviewable.
- Do not assume all production documents have the newest shape.
- Protected authority fields must not be migrated opportunistically during
  unrelated work.

## 9. UI versus domain authority

- UI components should present and orchestrate domain/service state.
- UI visibility, disabled buttons or client-side checks are not security
  boundaries.
- Protected rules belong in the appropriate service/domain/backend/rules layer.
- UI redesign must not silently change persistence, authorization or governance
  semantics.

## 10. Team-generation core

- Team generation remains deterministic for the same normalized inputs and
  explicit configuration unless an approved design intentionally introduces
  controlled randomness.
- AI may translate natural-language intent into structured parameters or
  explain deterministic results; AI must not become hidden unreviewable team
  authority.
- Match format is part of balancing semantics, including unequal on-field team
  sizes versus equal on-field numbers with substitutes.
- Future evaluator changes must be covered by canonical/golden scenarios before
  materially replacing mature generation behavior.

## 11. Production safety

- Production mutations, deployment, migrations and IAM/security changes require
  explicit release authorization.
- Read-only production diagnostics must use the smallest practical permission
  surface and must not be repurposed as mutation tooling.
- No service-account private key should be introduced where keyless short-lived
  impersonation is sufficient.
- Sensitive credentials and production data must not enter the repository.
- Production Firebase Functions failure logs must use stable diagnostic codes
  and explicitly allow-listed machine fields. At that trusted backend boundary,
  raw provider errors, messages, stacks, OAuth tokens, installation-token
  fragments, emails and user content must not be emitted merely for
  troubleshooting.

## 12. Regression discipline

- Known mature behavior must remain protected by automated regression coverage.
- Cross-cutting changes must pass the permanent Core Regression Gate.
- Security/auth/schema changes require adversarial verification appropriate to
  their blast radius.
- Automated gates must not be weakened merely to make a patch pass.
- Browser/device verification remains necessary where automated tests cannot
  establish real interaction or provider behavior.

## 13. Architecture-hardening rule

Hardening work is not general refactoring permission.

Each hardening task must:

- have a bounded safety objective;
- preserve existing product behavior unless the task explicitly changes it;
- avoid unrelated cleanup;
- add the smallest durable rail that prevents a meaningful class of failure;
- remain independently reviewable and revertible.

The live import/layer checks in `npm run check:architecture` are part of the
permanent Core Regression Gate. New exceptions require deliberate architecture
review; the check must not be weakened as an implementation shortcut.

## 14. Language versus durable data

- Stripes-authored user-facing language belongs in the approved i18n catalog
  and presentation layer, not in authority/security decisions.
- The i18n layer must not translate or reinterpret user- or provider-authored
  content; existing validation, sanitization and interchange behavior remains
  authoritative. Stable roles, statuses, schema fields, provider codes and
  interchange values must not be replaced by localized display strings in
  persistence.
- Locale preference is presentation-only and must not affect authentication,
  workspace membership, capability calculation or Firestore Rules.
- Backend recipient language requires an explicit allowlisted authority. It
  must not be inferred from an email address, domain, name or another user's
  device-local preference.
- The durable contribution and boundary rules are defined in
  `docs/architecture/INTERNATIONALIZATION.md`; the zero-baseline frontend policy
  in `npm run check:i18n` is part of the permanent Core Regression Gate.

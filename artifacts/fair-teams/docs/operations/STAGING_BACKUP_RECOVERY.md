# Stripes staging, backup, and recovery baseline

Status: H1 runbook plus H2 local recovery validation. No cloud project, bucket,
IAM binding, backup, restore, deployment, secret, or production setting was
created or changed by either milestone.

## Safety boundary

`fair-teams-dev` is the production Stripes Firebase/Firestore data environment,
despite the word `dev`. The repository also selects it by default in
`.firebaserc` and `src/lib/firebaseClient.ts`. Never treat it as disposable.

Every cloud command must name its project and database explicitly. Do not rely
on the active `gcloud` project, the Firebase default alias, inherited Vercel
variables, or frontend fallback values.

This runbook uses three action classes:

- **Repository preparation:** Codex may prepare code, manifests, checks, and
  command templates when requested.
- **Manual provisioning:** an authorized operator must create cloud projects,
  databases, buckets, OAuth clients, domains, billing, secrets, and IAM.
- **Production action:** a backup, export, restore, migration, production
  configuration change, or production data access requires separate explicit
  authorization immediately before it is performed.

Placeholder commands below are examples and were not run. Replace every
`<PLACEHOLDER>` only after an operator has verified the target in the cloud
console.

## A. Isolated staging

### Required boundary

A real staging environment is a separate stack, not a Vercel preview pointing
at production and not a second site using `fair-teams-dev`.

| Layer | Staging requirement |
| --- | --- |
| Firebase/GCP | A distinct project ID and billing boundary. Never `fair-teams-dev`. |
| Firestore | A Firestore Native database with staging-only synthetic data. Deploy the repository Firestore rules explicitly to this project. |
| Storage | A staging bucket with the repository Storage rules. No production objects or bucket credentials. |
| Auth | Staging-only authorized domains and enabled providers. Use test identities, not copied production users. |
| Functions | Deploy from `functions/` to the staging project, normally in `europe-west1`, with staging-only configuration and secrets. |
| Frontend | A separate Vercel project or custom environment rooted at `artifacts/fair-teams`, with `dist/public` as output and staging-only variables. |
| Google | A separate browser OAuth client and restricted browser API key for staging origins. Keep the scope exactly `drive.file`; use test accounts and test Drive files only. |
| Messaging | Staging-only VAPID/push configuration, or leave messaging disabled. |

Vercel Preview is not isolation when it inherits production variables. Use a
separate Vercel project or a detached custom environment and review every
variable before deployment. See the official [Vercel environment-variable
model](https://vercel.com/docs/environment-variables) and [monorepo project
setup](https://vercel.com/docs/monorepos).

### Frontend environment checklist

Set all of these explicitly for staging; none may use a production value:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_FUNCTIONS_REGION
VITE_GOOGLE_CLIENT_ID
VITE_GOOGLE_API_KEY
VITE_GOOGLE_APP_ID
```

Keep `VITE_FIREBASE_VAPID_KEY`, Trello, and AI features unset until their own
staging-only dependencies and data boundaries have been approved. Configure
the Firebase Auth staging domain, Google OAuth JavaScript origin, Google API-key
referrer restrictions, and any Picker configuration for the staging hostname.

The current notification Functions use `RESEND_API_KEY`, the production sender
`notifications@stripes.work`, and production `https://stripes.work/app` links.
Do not give staging the production Resend secret. Email invitations and
verification must remain disabled/fail-closed until a separate approved change
makes the sender and continuation URL environment-specific, or an approved
staging-only mail configuration exists.

### Provisioning and deployment order

All steps in this subsection are manual external work:

1. Create the staging GCP/Firebase project, billing/budgets, Firestore Native
   database, Storage bucket, and Auth providers.
2. Create staging-only OAuth, browser-key, domain, and Vercel resources.
3. Add staging-only environment variables and secrets. Do not copy production
   secrets as a shortcut.
4. Review the explicit target twice, then deploy only Firestore and Storage
   rules with an explicit project flag, for example:

   ```sh
   firebase deploy --project "<STAGING_PROJECT_ID>" --only firestore:rules,storage
   ```

5. Deploy Functions only after their complete target list and configuration
   have been reviewed and notification sender/links are staging-safe. Do not
   deploy the current mail Functions merely with a missing production secret.
6. Deploy the frontend only to the staging Vercel target and verify the built
   bundle identifies the staging Firebase project.
7. Seed synthetic rosters, organizers, attendance, equipment, Action Board,
   legacy native resources, strict Cabinet resource references, and Cabinet
   location metadata. Do not clone ordinary production data.
8. Verify staging cannot reach production Firestore, Storage, Functions,
   Google files, email, push, or Vercel environment values.

There is currently no repository staging project ID, Firebase alias, or Vercel
staging target. There is also no `firestore.indexes.json`; an operator must
inventory deployed composite indexes and TTL policies before staging or
recovery can be considered representative.

## B. Production backup baseline

### What must be protected

Before a schema migration, destructive script, bulk correction, rules change
with data implications, or workspace cleanup change, preserve:

- the entire Firestore `(default)` database, rather than a hand-maintained list
  of collection IDs;
- the exact repository commit containing Functions, `firestore.rules`, and
  `storage.rules`;
- deployed composite-index and TTL-policy inventories;
- Firebase Storage objects, especially
  `sharedRosters/{rosterId}/resources/...`, using a separately approved Storage
  protection/versioning or backup procedure;
- non-secret configuration identifiers needed to reconstruct the environment.

Firestore backup/export does not contain Firebase Storage objects or external
Google Drive/Sheets files. Cabinet location and resource-index records are
metadata/references only; do not copy organizers' external Google files without
a separate privacy and recovery decision.

Firestore backup/export also does not preserve Firebase Auth users or provider
configuration, Functions secrets, Vercel variables or Google OAuth clients.
Keep non-secret configuration inventories separately. Any identity recovery
procedure is a separately approved security/privacy operation; ordinary
rehearsals must create synthetic recovery users with deliberate test UIDs
rather than export or copy production identities.

Local roster JSON, private Google Drive roster backup, and the same-database
shared-roster history are application conveniences, not database disaster
recovery.

### Recommended layers

1. **Scheduled backups:** manually approve a daily Firestore backup schedule
   with an appropriate retention period. Firestore scheduled backups are
   consistent point-in-time copies containing data and index configurations,
   but not Security Rules or TTL policies, and they restore to a new database.
   See [Firestore scheduled backups and restore](https://cloud.google.com/firestore/docs/backups).
2. **PITR:** manually evaluate and enable point-in-time recovery for short-window
   recovery. PITR begins retaining versions only after it is enabled; it is not
   retroactive. See [Firestore PITR](https://cloud.google.com/firestore/docs/use-pitr).
3. **Pre-change managed export:** immediately before an approved high-risk
   change, create a full export to a dedicated restricted Cloud Storage bucket
   under a unique non-reused prefix containing UTC time, git SHA, and
   migration ID. A normal managed export can include writes that happen while
   it runs; use an approved PITR snapshot time when an exact checkpoint is
   required. See [Firestore managed export/import](https://firebase.google.com/docs/firestore/manage-data/export-import).

A unique prefix is naming, not immutability. The backup bucket needs separately
reviewed soft-delete, versioning and/or retention controls plus restricted
delete permission. Locking a retention policy can be difficult or impossible
to reverse and is therefore a distinct explicitly authorized production
decision.

Billing is required. Exports incur document reads and Storage costs. The export
bucket must be location-compatible with Firestore and must not be Requester Pays
or a Rapid bucket.

### Identity and permission expectations

Prefer human SSO/Cloud Shell or Workload Identity Federation with short-lived
service-account impersonation. Do not create or download long-lived JSON keys.
Use least privilege and separate routine backup visibility from restore power.
Relevant predefined roles include:

- `roles/datastore.backupsViewer` or `roles/datastore.backupsAdmin`;
- `roles/datastore.backupSchedulesAdmin` for schedule changes;
- `roles/datastore.importExportAdmin` for managed exports/imports;
- `roles/datastore.restoreAdmin` for scheduled-backup restores;
- reviewed bucket-scoped Storage access for the Firestore service agent.

The Firestore service agent is
`service-<PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com`. Cross-project
buckets require an explicit reviewed bucket grant. Do not use project Owner as
the routine operator role.

### Pre-change export procedure

These are production actions. They require an approved change record and an
independent second verification pass over the project, database, bucket,
prefix, and operation. Use a second person/reviewer when one is available; a
solo operator must pause and perform the second pass independently.

Read-only preflight templates:

```sh
gcloud firestore databases describe \
  --project="<PRODUCTION_PROJECT_ID>" \
  --database="(default)"

gcloud firestore backups list \
  --project="<PRODUCTION_PROJECT_ID>" \
  --location="<FIRESTORE_LOCATION>" \
  --format="table(name,database,state)"
```

Approved full-export template:

```sh
gcloud firestore export \
  "gs://<RESTRICTED_BACKUP_BUCKET>/pre-change/<UTC>-<GIT_SHA>-<MIGRATION_ID>" \
  --project="<PRODUCTION_PROJECT_ID>" \
  --database="(default)"
```

If PITR is enabled and an exact recovery time is required, add the separately
verified `--snapshot-time="<RFC3339_MINUTE_TIMESTAMP>"` value.

Do not begin the mutation merely because the export command was accepted. Save
the operation name, wait for `SUCCESSFUL`, and record project ID, database ID,
bucket URI, export prefix, snapshot/export time, document/byte progress, git
SHA, migration ID, operator, independent verification evidence, reviewer when
available, and Storage-backup status. A cancelled import can leave partial
updates, and import overwrites matching document IDs; never use import as an
exploratory production action.

## C. Non-production restore rehearsal

Perform this before relying on the procedure during an incident.

1. Manually provision an empty disposable recovery project and explicitly
   create its empty Firestore Native target database. It must have no production
   Vercel domain, OAuth client, email, push, Functions secrets, or service
   accounts.
2. Seed staging with synthetic records covering linked groups/rosters,
   organizer roles, invitations, attendance/conduct, ratings, Equipment, Action
   Board, notes/legacy resources, strict Cabinet resource references, Cabinet
   location metadata, and representative subcollections.
   Create synthetic staging Auth users with fixed test UIDs that match the
   seeded membership records; never copy production users.
3. If scheduled backups are part of the approved production baseline, first
   rehearse that mechanism inside the staging project: wait for a completed
   scheduled backup, then restore it to a new, previously nonexistent named
   database in the same project and location. Validate its data with Admin/test
   tooling and record that this same-project path does not prove cross-project
   recovery.
4. Export the non-production database using the same full-export method and a
   recovery bucket whose access has been reviewed for both projects.
5. Import only into the explicit empty cross-project recovery target:

   ```sh
   gcloud firestore import \
     "gs://<RECOVERY_BUCKET>/<COMPLETED_EXPORT_PREFIX>/" \
     --project="<RECOVERY_PROJECT_ID>" \
     --database="(default)"
   ```

6. Create synthetic recovery Auth users with the same deliberate test UIDs,
   then reapply and verify Auth/provider configuration, Firestore rules, Storage
   rules, IAM, composite indexes, and TTL policies separately. Managed exports
   do not include Auth identities or index definitions; scheduled backups
   include index configurations but still omit Auth, Rules and TTL policies.
7. Restore or relink only synthetic Storage objects using the separately
   rehearsed Storage procedure. Confirm native references resolve. Validate
   external Cabinet references against deliberately synthetic/test provider
   resources when those providers are part of the rehearsal; a Firestore
   restore does not recreate or guarantee external provider access.
8. Validate counts and application invariants: authoritative roster/group
   linkage, organizer capabilities, Firebase/Google separation, attendance,
   ratings, Equipment, Action Board, notes/resources, Cabinet folder metadata,
   Cabinet resource/index shape and authority, and no unexpected writes to any
   other project.
9. Record recovery point, elapsed recovery time, operation IDs, validation
   evidence, missing assets/configuration, achieved RPO/RTO, and follow-up work.
10. Deleting the recovery environment or its exports is a separate destructive
   action requiring explicit authorization.

The Firebase emulator import/export feature remains useful for deterministic
local tests, but it does not rehearse managed cloud backup formats, IAM, bucket
access, or production-scale recovery.

### Automated H2 local recovery validation

Run from `C:\V38OCR\artifacts\fair-teams`:

```text
npm --prefix functions run test:recovery:emulator
```

The command is also a mandatory Core Regression Gate stage. It uses the exact
Firebase demo project ID `demo-stripes-recovery-rehearsal`, the pinned
Functions-local Firebase CLI and two fresh Firestore emulator lifecycles. It
strips inherited cloud project, credential and emulator variables, seeds only
fixed `.invalid` identities and synthetic Stripes records, exports them to a
validated temporary directory, imports that export into the fresh lifecycle,
then removes the temporary export and emulator logs.

The automated checks cover mutual group/roster linkage, organizer/member role
shape, representative Equipment, Attendance, Action Board, ratings, Notes and
legacy Club-resource metadata, Cabinet location metadata, the strict provider-neutral
Cabinet resource/index record, invitation/lock state, timestamps, expected
document counts and representative current Firestore access denials. It checks
reference metadata only and never calls an external provider.

This proves only the application-data/invariant portion of a Firestore emulator
export/import. It does **not** prove managed Firestore export, scheduled backup,
PITR, cross-project restore, IAM/service-agent or bucket permissions, location,
retention, indexes/TTL, Firebase Auth, Storage objects, Functions/secrets,
external Google files, production scale or achieved RPO/RTO. The synthetic
cloud/staging rehearsal above remains a manual prerequisite before relying on
those systems during an incident.

## Manual follow-ups established by H1

- Provision and approve a genuinely isolated staging stack.
- Make notification sender/link configuration staging-safe before enabling
  staging email.
- Inventory and codify Firestore indexes and TTL policies.
- Choose retention/RPO/RTO, approve scheduled backups and PITR, and configure
  them manually.
- Define and rehearse Firebase Storage protection for resource files.
- Run the first synthetic cloud/staging managed restore rehearsal and retain
  evidence; the local emulator rehearsal does not close this item.
- Separately authorize any future production backup/export or restore action.

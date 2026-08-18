## Phase autonomy

When explicitly instructed to complete a roadmap phase autonomously, Codex may execute approved atomic tasks within that phase without waiting for manual “continue” approval after each successful task.

Each atomic change should remain separately committed and independently revertible.

Codex must stop at phase boundaries or whenever a task requires a new product decision, architecture decision, backend/persistence change, or material scope expansion.

## W1 — Public Website / Launch Readiness — COMPLETE

Completed 2026-08-12.

Current public structure:
- `/` — Stripes public homepage
- `/app` — application
- `/privacy`
- `/terms`
- `/support`

The public site includes real product visuals, legal/support information,
consistent Stripes branding, and the "Team generator and club organizer"
positioning.

The public website and app intentionally remain on the same origin.

### W2 — Meetup Application Readiness — SUBMITTED / WAITING

Meetup API eligibility/access request submitted 2026-08-12.

Current state:
- Privacy Policy and Terms are live
- intended Meetup data access is documented
- read-only RSVP import workflow is documented
- data minimization/retention intent is documented
- implementation plan is in `docs/meetup/MEETUP_INTEGRATION_PLAN.md`

Do not implement Meetup OAuth/API integration until Meetup access permits it.

Meetup approval must not block the 2026-09-30 Google Play launch.

## Meetup Player Identity & Profile Photos — FUTURE / WAITING FOR API ACCESS

Status: APPROVED PRODUCT DIRECTION.

Do not implement until Meetup API access permits it.

### Source-of-truth principle

For Meetup-connected players, Meetup should remain the source of truth for
Meetup identity and profile photos.

Stripes should NOT permanently copy Meetup profile photos into Firebase by
default.

Preferred model:

- import/match attendees using Meetup member ID plus available profile data;
- store the Meetup member ID/reference needed to re-identify the player;
- display the Meetup-hosted profile thumbnail when available;
- cache thumbnails locally only as needed for performance;
- periodically refresh the Meetup member/photo reference;
- when a Meetup user changes or removes their profile photo, Stripes should
  eventually reflect that change;
- if the Meetup image becomes unavailable, fall back to initials/avatar.

Core rule:

**Synced Meetup avatar, not copied Meetup photo.**

Photo synchronization must never be required for attendance or team generation.

### Manual player photos

For players not sourced from Meetup:

- player photos remain optional;
- initials/avatar remain the default;
- organizer-added photos are private to that organizer;
- they are not automatically shared with other shared-roster organizers;
- store only a small local thumbnail rather than a large original;
- local-only storage is too fragile as the sole long-term solution.

Future backup direction:

- optional private backup through the organizer's connected Google account;
- restore after phone loss, reinstall or device replacement;
- another organizer does not automatically receive those private photos;
- clearly indicate when a photo exists only on the current device.

Conceptual boundary:

**Shared roster identity belongs to the club.  
Personal player-photo memory belongs to the organizer.**

### Club/team logo thumbnails

Club/team logos are shared workspace identity assets.

Approved direction:

- keep only a small optimized shared logo thumbnail;
- Firebase Storage is acceptable for this narrow purpose;
- associate it with the shared roster;
- restrict changes to appropriate organizer roles;
- do not treat Firebase Storage as general-purpose club file storage.

### Privacy / launch principle

Preferred media boundary:

- Meetup player photo → referenced/synced from Meetup;
- manual player photo → local/private with optional private Google backup;
- club/team logo → small shared Firebase thumbnail;
- documents/receipts/Action Board/Cabinet files → Google Drive.

Revisit exact Meetup member/photo fields, OAuth scopes, caching requirements and
API terms once Meetup API access is granted.


# Approved Product Backlog After UI Consolidation

P0-P5 initial UI consolidation and regression pass are complete.
P5 regression checks remain an ongoing manual launch gate for subsequent work.

### Generated team color selector

Replace the current text-based team color selection with a compact visual stripe-color selector.

Approved direction:
- use simple stripe icons matching Stripes branding rather than generic color circles;
- present colors in a compact popover/modal;
- include Blue, Red, Green, Yellow, Purple, and Pink;
- selected color has a clear ring/check state;
- preserve accessible labels such as "Blue team", "Purple team";
- Purple must be added as an available team color;
- preserve existing team-color state and behavior;
- do not redesign generated team cards beyond what is necessary for the selector.

Design reference:
`docs/design/team color picker reference.png`

The reference image communicates visual direction, not pixel-perfect implementation.
Explore additional stripe-icon options and choose the strongest fit for Stripes
while preserving the existing typography, spacing, modal primitives,
responsive behavior, and accessibility rules.

### Lightweight Teams Session Header

Pending verification / implementation:
- lightweight date/day identity only
- visual/product polish, not another dashboard layer

Meetup Connection + RSVP Import remains an approved future integration.

Current status: waiting for Meetup eligibility/API access.

If approved, follow `docs/meetup/MEETUP_INTEGRATION_PLAN.md`.
Meetup must remain optional and must not block Android launch.

## External Connections Architecture

Before adding new external integrations, consolidate Stripes around one coherent Connections model.

Users should think:

"I connected Stripes to Google."

They should not need to separately understand or authenticate:
- Google backup
- Google Drive attachments
- future Google capabilities

The underlying permissions/capabilities may remain separate, but the user-facing connection should be unified.

Create a common Connections architecture before introducing additional provider-specific UI.

Potential providers:

- Google — primary supported external connection
- Other providers — future/demand-driven

Do not scatter independent OAuth/account flows throughout Roster, Action Board, Club, or Settings.

---

## Google Connection

Google is the primary external service for Stripes.

Existing Google backup functionality for local rosters should be inspected and reused/consolidated rather than creating a second unrelated Google integration.

The Google connection may eventually provide multiple capabilities:

### Local roster backup

- preserve the existing local-roster cloud backup capability
- present this as part of the unified Google connection
- avoid unnecessary changes to working backup behavior
- Firebase/shared-club data remains independent from Google backup

### Google Drive files

Google Drive is the preferred storage path for normal Stripes documents and
attachments.

Stripes should not build a second general-purpose document store in Firebase
Storage when the user's Google Drive can own the underlying file.

Desired behavior:

- reuse the connected Google Drive authorization/session where appropriate,
  while keeping Firebase Google identity separate;
- request only additional Drive permissions needed for the requested feature;
- avoid unnecessary re-authentication;
- use narrow OAuth scopes where feasible;
- basic file upload may place files into a Stripes-managed location in the
  connected user's Drive;
- direct browsing/picking of arbitrary existing Drive files may remain a
  Stripes Club convenience;
- Firestore stores Stripes context, metadata and Drive references, not file
  bytes.

For shared-roster resources, Google Drive permissions remain authoritative.

Stripes must never claim a Drive file is available to every organizer unless
Google permissions actually grant that access.

The final shared-file flow must account for:

- files owned by one organizer;
- access by other organizers;
- revoked permissions;
- organizer removal;
- external deletion;
- moved/renamed files;
- disconnected Google accounts.

Google Drive must not become the canonical database for roster, Action Board,
votes, attendance or other Stripes application state.

---

---

## Action Board File Attachments

Status: APPROVED FUTURE CAPABILITY.

Normal Action Board files should use the connected user's Google Drive rather
than Firebase Storage.

Firestore / Action Board data stores attachment metadata, Stripes context and
the Drive reference rather than file bytes.

Preferred flow:

- upload from device → save into connected Google Drive through Stripes;
- or select an existing Drive file where the user's plan permits;
- immediately attach the resulting resource to the card;
- preserve that same resource for later Cabinet organization without
  duplicating the underlying file.

Initial capabilities may include:

- upload from device to Google Drive;
- View/Open where appropriate;
- Download where appropriate;
- Remove from the Stripes card context;
- image/PDF/common document support;
- uploader/date/file-size/source metadata;
- unavailable/reconnect state when Drive access is lost.

Important deletion rule:

`Remove` removes the Stripes relationship. It must not silently delete the
underlying Drive file.

Initial technical limits may remain conservative for UX/performance, for
example:

- approximately 10 MB suggested maximum per direct Stripes upload initially;
- approximately 5 attachments per card.

These are UX limits, not Stripes cloud-storage quotas.

Resource types may include:

- google_drive
- google_docs
- external_link

Firebase Storage should not be used for ordinary Action Board documents.

Basic Drive-backed contextual attachments should remain available in Free.

Stripes Club may add:

- centralized Club Cabinet;
- direct Drive browsing/picking;
- richer folders/search/cross-context reuse;
- future connected-file automation.

## Add to Card

Status: APPROVED ACTION BOARD DETAIL REFINEMENT.

The opened-card system should continue evolving toward one compact:

"+ Add to card"

model.

Core/free card items may include:

- Note
- Assignees
- Due date
- Link

Plan/storage-dependent items may later include:

- File
- Google Drive

Only content actually added to a card should remain visible.

Do not create large empty sections for unused properties.

Keep the principle:

simple surface, deep card.

---

## Generic External Links

Normal pasted links remain part of the Free/core Action Board experience.

Generic links provide compatibility with:

- Notion
- Dropbox
- OneDrive
- Nextcloud
- Google Docs
- websites
- other external services

A user must not need a paid integration merely to paste and open a normal URL.

Dedicated provider integrations should be built only when they add meaningful
convenience beyond ordinary links.

---

## Notion

Dedicated Notion integration is DEFERRED.

Notion pages can already be added using normal external links.

Do not implement Notion OAuth, page pickers, file storage, or synchronization
unless:

- meaningful user demand appears; or
- a future product requirement provides clear value beyond ordinary links.

Notion should not become a dependency of core Stripes workflows.

---

## Connections UI

Eventually provide one coherent Connected Services / Connections area.

Conceptual example:

Google
Connected
- Local roster backup ✓
- Drive files ✓

Other services should appear only when genuinely supported.

The goal is a single understandable account/service model, not separate authentication experiences in individual features.

---

## Data ownership boundaries

Firebase / Firestore:
- shared Stripes application state;
- Action Board state;
- votes/actions/comments;
- shared Club data;
- resource metadata/context and provider references.

Firebase Storage:
- small shared Stripes-owned assets that genuinely require synchronization,
  such as optimized club/team logo thumbnails;
- not ordinary club documents, receipts or Action Board/Cabinet attachments.

Google:
- local roster backup;
- primary storage path for normal Stripes documents/attachments;
- externally hosted Drive/Docs resources;
- optional private backup of organizer-local player thumbnails in the future.

Generic URL:
- external resources hosted elsewhere.

External integrations augment Stripes.

They must not become required databases for core roster/team-generation state.

## Action Board strategic position — 2026-08-12

Action Board is now treated as a potential collaboration centerpiece and one
of the strongest reasons for organizers to use the Club layer repeatedly.

Approved workflow:

Ideas → Decide → To-do → Done

`To-do` is intentional. Moving a card to Done represents completion, and moving
it back naturally reverses completion.

Product boundary:
- Do not turn Stripes into a generic Trello/project-management clone.
- Signal/group chat remains the place for conversation.
- Action Board owns durable decisions, responsibility, follow-through and
  lightweight institutional memory.
- Preserve the simple-surface / deep-card principle.
- Card evolution through decisions, scheduling, action and Done is a major
  Stripes-specific differentiator.
- Moving to Done remains completion; moving back remains naturally reversible.

Visual direction:
- Action Board has its own muted slate-navy working canvas.
- Workflow columns are light surfaces above that canvas.
- Cards remain crisp white and highly readable.
- Amber remains semantic for Decide; sky remains semantic for active work.
- Action Board blue stays local to this workspace rather than becoming a
  generic Club brand color.
- Desktop typography prioritizes scanning and clarity over maximum density.
- Mobile/tablet remain touch-first with explicit Move; desktop retains drag.

### Interaction and button language

Stripes should use a consistent action vocabulary across features.

- Prefer an icon plus a short action label when an action is consequential,
  non-obvious, or could reasonably be interpreted in more than one way.
- Icon-only controls are appropriate only when the meaning is already obvious
  from context and space is genuinely constrained.
- Do not introduce ambiguous standalone symbols for important actions.
- Use consistent verbs across Stripes wherever the same action is meant:
  View, Download, Remove, Edit, Move, Add, Save and Cancel.
- `View` means inspect or preview the resource without implying that it leaves
  Stripes.
- `Download` means retrieve the original file to the user's device.
- `Remove` means remove/delete the resource from the current Stripes context
  and should use clear destructive styling or confirmation where appropriate.
- External-link iconography is reserved for actual external URLs/resources.
  It must not be used as a generic synonym for View/Open.
- Do not make a filename secretly perform different primary actions depending
  on file type when explicit View/Download controls can communicate the action
  more clearly.
- New features should reuse this interaction language rather than inventing
  feature-specific button conventions.

Near-term:
- Continue simplifying opened-card controls around a compact Add to card area.
- Ordinary external links, including pasted Google Docs URLs, remain part of
  the Free/core card experience.
- Basic Drive-backed contextual attachments should reuse the unified Google
  connection and remain compatible with the Free collaboration experience.
- Direct browsing/picking of arbitrary existing Drive files can remain a paid
  Club convenience.
- Do not build ordinary Action Board/Cabinet document storage on Firebase.
- Evolution remains structured institutional memory and a future integration
  asset.


## Club Cabinet architecture

Status: APPROVED PRODUCT DIRECTION.

### Purpose

Club Cabinet is Stripes' premium shared file-organization layer.

Its job is:

- help organizers find important club documents;
- organize durable files and references;
- preserve useful context around those resources;
- make the same resource available wherever it matters in Stripes.

Club Cabinet is NOT:

- a document-authoring suite;
- a Google Docs replacement;
- a Dropbox/Google Drive clone;
- a wiki;
- a rich collaborative page editor.

Stripes owns organization, context and retrieval.

The appropriate external application owns document editing.

Examples:

- PDF → preview/open in Stripes where practical
- Google Doc → open in Google Docs
- Word document → open/download with the appropriate application
- external URL → open normally

If future usage demonstrates a genuine need for a native Club Handbook/Page
type, evaluate it separately rather than building wiki functionality into the
initial Cabinet.

### One Cabinet, multiple providers

Organizers should experience ONE Club Cabinet.

Do not expose separate navigation such as:

- uploaded files
- Google files

A Cabinet resource may be backed by:

- Google Drive / Google Docs;
- ordinary external URL;
- future providers where justified.

Provider location is metadata, not navigation.

Each resource should show only a subtle source tag, for example:

- `Google Drive`
- `Google Docs`
- `Link`

Search, folders, Pinned, Recent and contextual linking should work across these
resources as one coherent library.

### Google Drive-backed files

Normal files added through Stripes remain hosted in the connected user's
Google Drive.

Core principle:

**Stripes Cabinet is not a replacement for Google Drive. Stripes organizes and
explains; Google stores, edits and protects.**

Stripes owns:

- organization;
- context;
- metadata;
- relationships between resources and Action Board/Equipment/etc.

Google owns:

- actual document/file bytes;
- Google Docs, Sheets and presentation editing;
- file/folder ownership;
- Viewer, Commenter and Editor permissions;
- sharing controls and Google-native collaboration;
- native preview, version and edit history where applicable.

Stripes provides:

- club context and categories/collections;
- responsibility and source/type context;
- resource discovery and relationships to club workflows;
- actions to open originals in Google;
- truthful access/unavailable/reconnect information where available.

Cabinet documents are not automatically read-only. Clubs may keep live working
Google Docs, Sheets and presentations in Cabinet, such as a Treasurer's annual
budget spreadsheet. Google permissions determine whether another organizer is
a Viewer, Commenter or Editor. Future descriptive states such as **Working
document**, **Final** or **Club record** are organizational/context metadata
unless a separate permissions architecture is explicitly approved. G2 must not
create immutable records, Stripes-managed versioning or special read-only
enforcement.

A Drive-backed resource:

- does not consume a Stripes-hosted file quota;
- may appear in Cabinet folders;
- may be linked to multiple Stripes contexts without duplicating the file;
- preserves its Stripes metadata/reference if temporarily unavailable.

If a Google file is deleted or permissions change, Stripes should show an
appropriate unavailable/reconnect state.

Basic upload may create a Drive file through the unified Google connection.

Direct browsing/picking of arbitrary existing Drive resources is a richer Club
convenience.

For shared rosters, Drive permissions must be handled explicitly. Stripes
should never imply that all organizers can access a resource until Google
actually grants that access.

### Ordinary links

Ordinary pasted links remain Free.

They may appear in Cabinet alongside files and Google resources without
consuming Stripes storage.

This preserves compatibility with:

- Notion
- Dropbox
- OneDrive
- Nextcloud
- Google Docs links
- websites
- other external services

A paid provider integration must provide convenience beyond what an ordinary
URL already provides.

### Cabinet organization model

Initial Cabinet UX should favor a simple organizer-friendly structure rather
than a desktop-style file tree.

Primary views:

- Pinned
- Recent
- All
- Unfiled

System collections should automatically expose resources by Stripes context.

Initial system collections:

- Action Board
- Equipment

These are smart/context views, not physical duplicate folders.

User-created folders provide optional manual organization.

Suggested starter folders may include:

- Club & Rules
- Venues
- Meetings
- Equipment
- Events
- Receipts

These are suggestions only. Organizers may create, rename and delete their own
folders.

Prefer a shallow folder model initially.

Do not build a deep hierarchical file tree unless real club usage demonstrates
the need.

### Contextual uploads automatically enter Cabinet

Every Drive-backed club file added through Stripes should exist once as a Cabinet resource.

A user should be able to upload a file where they are already working without
being forced to organize it first.

Example:

Action Board
→ New venue
→ Upload Venue-offer.pdf
→ attachment works immediately

That file automatically becomes accessible through Club Cabinet.

Drive-backed files added from Action Board automatically appear in the Cabinet's
`Action Board` system collection.

Drive-backed files added from Equipment automatically appear in the Cabinet's
`Equipment` system collection.

If the organizer does nothing else, the file remains available through its
original context and through Cabinet.

### Categorize later without duplication

Organizers may optionally categorize a contextual file into a user-created
Cabinet folder later.

Example:

Venue-offer.pdf

System context:
- Action Board
- New venue

User folder:
- Venues

This must remain ONE underlying resource.

Categorizing the file must not:

- duplicate the binary;
- break the Action Board attachment;
- remove its system-origin relationship;
- consume storage twice.

System collections represent origin/context.

User folders represent manual organization.

A categorized file may therefore appear in both:

- `Action Board` system collection
- `Venues` user folder

while still being one Cabinet resource.

### Context relationships

Cabinet resources should preserve where they are used.

A resource detail may show:

Used in:
- Action Board · New venue
- Equipment · Blue football bag

This creates a Stripes-specific advantage over a generic cloud drive.

The relationship should also work in reverse:

- files uploaded from Action Board / Equipment automatically enter Cabinet;
- an existing Cabinet resource may later be linked to an Action Board card or
  Equipment item without creating another copy.

### Do not interrupt the user's workflow

Contextual upload should prioritize:

upload → attach → continue working

Do not force an organizer to choose a Cabinet folder during every upload.

New contextual files may remain Unfiled until the organizer chooses to
categorize them.

Organization should be available, not mandatory.

### Cabinet actions

Initial resource-management actions may include:

- Open
- Pin / unpin
- Move to folder
- Rename
- Link to Action Board / Equipment
- Replace native file while preserving references
- Delete

Full version-control UI is not required initially.

Prefer safe deletion/Trash behavior over complicated per-file permission
systems.

### Permissions

Cabinet belongs to the shared roster / club workspace.

Access to Stripes Cabinet metadata follows active workspace membership. Access
to the underlying Google folders/files follows Google permissions.

Google folder permissions are the important file-security boundary because
files may inherit access from their parent folder. G2 should focus on how the
Cabinet folder/location is shared in Google rather than recreating Google ACLs
inside Stripes.

Example Finance folder:

- Maria -> Editor;
- Joon -> Viewer;
- Alex -> Viewer;
- Treasurer assistant -> Editor.

Google remains authoritative for those roles. Do not mirror the complete
Google ACL into Firestore, and do not claim a Stripes organizer has Google
access unless that access has actually been verified.

Do not build a redundant Stripes per-file ACL for the first Cabinet version.

Player/member Cabinet access is a separate future product decision.

### Free versus Stripes Club

Free users may use basic Drive-backed contextual attachments where Free
Stripes functionality permits.

They should be able to:

- connect Google when a file capability requires it;
- upload contextual attachments into their connected Drive;
- open existing Drive-backed Stripes attachments;
- remove an attachment from its Stripes context;
- continue using ordinary links without Google.

Free does not need the full centralized Cabinet explorer or arbitrary Drive
browser.

If a Free club later upgrades, its existing Drive-backed contextual resources
should already be available inside Cabinet because the underlying Stripes
resource metadata model is shared.

Stripes Club adds the organizational layer:

- centralized Club Cabinet explorer
- folders
- unified search
- Pinned / Recent / All / Unfiled
- system collections
- cross-context resource reuse
- "Used in" relationships
- direct Google Drive / Docs browsing and selection
- richer connected-file organization and cross-context reuse
- future higher-value file conveniences

The premium value is organizational clarity and scale, not merely permission to
attach a file.

### Product / marketing position

Do not primarily market Club Cabinet as:

"2 GB cloud storage."

Position it as:

**Keep your club's important files organized and available where your
organizers actually need them.**

Supporting concept:

Rules, venue documents, receipts and meeting files can live in one organized
Cabinet and remain connected directly to the Action Board, Equipment and other
relevant Stripes contexts.

Core principle:

**One Cabinet. One organization system. Google can own the files; Stripes owns
the context.**


## Monetization & Free/Paid Product Contract

Status: APPROVED PRODUCT DIRECTION

### Product principle

Stripes should not use a traditional feature-locking SaaS model.

The free version must be genuinely useful enough that an organizer can discover
Stripes independently, use it for real sessions, show it to fellow organizers,
and demonstrate its value before anyone is asked to pay.

Core principle:

**Stripes must never require payment before an organizer can experience and
demonstrate its core value to other organizers. Monetization begins when a
group needs more scale, integrations, or organizational
infrastructure—not when an individual is still discovering the product.**

Free Stripes should feel like a complete product for a small organizer team.

Paid Stripes should primarily provide:

- greater scale
- Club Cabinet/file management
- richer connected integrations
- future automation/convenience
- larger organizer teams

Do not deliberately cripple core Stripes functionality to manufacture
subscription value.

### Free Shared Roster

Free users may create and genuinely use a shared roster.

Free roster limits:

- 1 shared roster
- up to 3 organizers
- unlimited players
- no ads

Three organizers is intentional. It allows a small organizing team to properly
experience collaboration, including meaningful voting and majority decisions,
before paying.

The free shared roster must not behave like a demo.

### Features fully functional for free

Core team workflow:

- full roster management
- player ratings
- advanced ratings/balancing
- player preferences
- pairing/locking rules
- Today/session selection
- full fair-team generator
- manual swaps and adjustments
- team/session history
- exports
- OCR/screenshot import
- core voice/helper features where practical

Never create a paid tier with better or fairer balancing.

**Fairness is core to Stripes.**

### Meetup import

Meetup attendee import should be available in the free tier if API access is
approved and technically viable.

Meetup directly strengthens the core acquisition workflow:

**Meetup event → attendees → Today → generate fair teams → share**

It gives a first-time organizer an immediate demonstration of Stripes' value
and makes Stripes easier to show to other organizers.

Meetup should therefore be treated differently from general productivity
integrations such as Google Drive.

### Shared collaboration

The following should work fully with the free shared roster and its maximum
three organizers:

- shared roster synchronization
- shared ratings
- shared Equipment
- shared Action Board
- action ownership
- comments
- Evolution/history
- voting
- shared Club Attendance/conduct records
- notifications
- existing Club Notes access during transition
- future deterministic Club Activity when implemented

Do not create artificial basic-voting or basic-Action-Board restrictions.

If multiple organizers are present, they should be able to properly use the
feature.

### Notifications

Normal collaboration notifications must be free.

Examples:

- notify organizers about a vote
- notify organizers about an action
- relevant email/push notifications

A shared workspace without notifications would not be genuinely collaborative.

Future automated reminders/workflows may become a paid convenience feature,
but ordinary notifications are part of the core experience.

### Voting

Voting is primarily a collaborative feature.

For a private/single-organizer workflow, the useful action is generally:

**Record decision**

rather than having the organizer vote alone.

Once two or three organizers share the roster, voting becomes fully available.

Three free organizers intentionally allow real outcomes such as a 2–1
decision.

Future player/member voting should use a lightweight responder/member role
rather than requiring players to become organizers.

### Equipment

Equipment should remain focused on:

**What does the club own, and who currently has it?**

Free shared Equipment should remain fully synchronized.

Useful future additions:

- purchase date
- purchase price where relevant
- optional proof-of-purchase/receipt attachment

Do not turn Equipment into:

- accounting software
- expense management
- depreciation tracking
- supplier management
- reimbursement administration

A receipt is supporting documentation for warranty, replacement, reimbursement
or reference—not the beginning of an accounting system.

### Legacy Club Notes → Club Activity + Club Cabinet

Club Notes are now a **legacy shared-organizer feature to preserve**, not a
destination feature to expand.

Do not delete existing notes or break access to them during transition. Do not
spend a major implementation phase turning Club Notes into a richer document
editor or repairing it beyond what is required for safe continuity.

The proposed operational successor is deterministic **Club Activity**.

Club Activity should provide a quiet, compressed view of meaningful current
state and recent changes from systems such as:

- Action Board;
- Equipment;
- Attendance / conduct;
- organizer membership/governance;
- later Cabinet resources.

It should not become a raw chronological audit feed. Repeated low-value events
should collapse into useful state/result summaries with drill-down history.

Example direction:

- Equipment bag → `Now with Joon · changed Aug 15 ›`
- Action Board vote → `Match-ball purchase approved 4–1 ›`
- Attendance → `3 incidents this month ›`

Club Activity must remain useful without AI and should remain available to the
same small Free organizer team.

A future paid **AI Club Brief** may summarize the already-curated Activity
state into roughly 3–5 short grounded bullets. It should be cached, should not
run on every Club open, and must never replace the deterministic Activity rows
as the authoritative state.

Do **not** implement Club Activity until its event categories,
suppression/compression rules, ranking/importance behavior, history semantics,
resolved-item behavior and notification relationship have been explicitly
designed.

**Club Cabinet remains a separate Google-backed file/context organization
layer.** It is not the evolution of manual Notes and should not depend on the
old Notes UX.

Club Cabinet should become the central lightweight document/file layer for
organizers.

Possible contents:

- important PDFs
- venue documents
- rules
- meeting documents
- receipts
- reference images
- important external links
- Google Drive/Docs references

Do not attempt to recreate Google Drive or Dropbox.

Files should also be attachable contextually throughout Stripes.

Examples:

Equipment:
- Ball bag
- Receipt.pdf

Action Board:
- New venue
- Venue-offer.pdf

Club Cabinet:
- Club rules.pdf
- Hall instructions.pdf

Drive-backed files remain in the connected Google account; Stripes stores their shared context and references.

### File / storage model

Stripes should not make ordinary document storage a Firebase-hosted subscription
quota.

Normal club files, receipts and Action Board/Cabinet attachments should use the
connected user's Google Drive.

Therefore remove the previous assumptions of:

- approximately 100 MB Stripes-hosted storage for Free;
- approximately 2 GB Stripes-hosted storage for Club.

Do not show a Stripes storage gauge for Google-hosted files.

Google's own storage allowance remains authoritative.

The following remain normal Stripes/Firebase application data and must not be
presented as user file-storage consumption:

- players;
- ratings;
- attendance;
- votes;
- comments;
- Action Board cards;
- equipment records;
- text notes;
- application history;
- Drive metadata/references;
- external links.

Firebase Storage remains appropriate only for small shared app assets such as
optimized club/team logo thumbnails.

The paid boundary shifts away from raw gigabytes and toward organizational
value and connected convenience:

- centralized Club Cabinet;
- folders/search/Pinned/Recent/Unfiled;
- direct Drive/Docs browsing and selection;
- cross-context file reuse;
- "Used in" relationships;
- future connected-file automation.

Do not market Stripes Club as cloud storage.

### Downgrade behaviour

Downgrading from Stripes Club must never delete, move or take ownership of a
user's Google Drive files.

Existing files remain in Google Drive regardless of Stripes subscription state.

After downgrade:

- existing Action Board/Equipment resource references continue to open where
  Free functionality permits;
- ordinary external links continue working;
- users may remove stale references from Stripes;
- Google Drive remains fully under the user's control;
- paid-only Cabinet organization may become unavailable for new organization
  actions, but Stripes must not lock users out of the underlying files.

Users may lose paid conveniences such as:

- centralized Cabinet organization;
- arbitrary Drive/Docs picker access;
- future premium connected-file automation.

Trust principle:

**Cancelling Stripes never traps or deletes the user's files because Stripes
does not own the underlying Google Drive documents.**

### Integrations

Integrations should be evaluated according to whether they are part of Stripes'
core acquisition workflow or represent ongoing convenience.

#### Meetup

FREE.

Reason:

- directly strengthens attendance → team generation
- creates a powerful first-use demonstration
- helps an individual organizer show colleagues why Stripes is useful

#### Google Drive / Docs

MIXED CORE + PAID CONVENIENCE.

The unified Google connection may support core/free capabilities where Google is
the storage path required to avoid Stripes hosting user documents.

Free may include:

- connecting Google;
- existing local-roster backup;
- basic contextual file upload into the user's Drive;
- opening existing Drive-backed Stripes attachments;
- ordinary pasted links.

Stripes Club may add:

- centralized Club Cabinet;
- browsing/selecting arbitrary existing Drive files;
- richer Drive/Docs organization;
- cross-context reuse/search;
- future connected-file automation.

Google Drive remains an external file store, not the Stripes application
database.

#### Google Calendar

Potential PAID CONVENIENCE integration.

Free Stripes should retain reasonable manual/export options where practical.

Connected calendar workflows may become part of the paid
collaboration/convenience layer.

Priority remains below Meetup and Drive unless actual demand proves otherwise.

#### Notion

Potential future integration/export.

Lower priority and more niche.

Do not build until genuine demand exists.

### Paid plan

Working concept:

**Stripes Club — €4.99/month per shared roster**

Exact naming and pricing may change.

Paid should not mean "unlock the real app."

It should mean the group's Stripes workspace has grown beyond the generous free
level.

Likely paid benefits:

- more than 3 organizers
- Club Cabinet
- richer Google Drive/Docs browsing and organization
- Google Calendar integration
- future automation/reminder conveniences
- future higher-cost infrastructure features
- additional storage options where needed

Players should remain unlimited or extremely generous.

**Do not charge per player.**

### Organizer limits

Current working model:

Free shared roster:
- up to 3 organizers

Paid organizer allowance:
- TBD

Possible paid allowance:

- 5 organizers
- 10 organizers
- another generous number

Do not finalize paid organizer-seat pricing until actual infrastructure cost and
real club usage have been evaluated.

Avoid complex per-seat SaaS pricing at launch unless usage proves necessary.

### Trial strategy

The previously considered 3-month Club trial is no longer automatically
assumed.

Because the free tier already provides the genuine collaborative Stripes
experience indefinitely, users should know whether Stripes is useful before
upgrading.

Possible options to evaluate later:

- 3-month Club trial
- 30-day Club trial
- 1 month free
- no additional trial beyond the generous Free tier

The upgrade trigger should occur naturally when the group tries to exceed a
free limit or enable a paid convenience.

Examples:

- invite organizer #4
- activate Club Cabinet
- use advanced Drive/Docs browsing or organization
- activate a future premium automation

Do not start a paid-trial countdown merely because someone downloaded Stripes.

### Acquisition philosophy

Protect this expected acquisition path:

1. An organizer discovers Stripes independently.
2. They use the free roster, Today and team generator.
3. Meetup/OCR makes attendance entry easy.
4. They generate teams and experience Stripes' value.
5. They show it to fellow organizers.
6. Up to two colleagues join the free shared roster.
7. The team uses real Action Board decisions, voting, Equipment, notifications
   and Attendance together.
8. Stripes becomes part of the group's organizational infrastructure.
9. Growth, storage or integration needs eventually create a natural upgrade.

**The free product is itself Stripes' primary marketing mechanism.**

### Multisport roster + billing architecture — working principle

**Architecture direction locked; exact billing implementation deferred.**

Multisport support creates an important distinction between a player identity,
a sport-specific roster and the future subscription/billing unit.

A roster must remain specific to one sport or playing context because the same
person can have substantially different ability in different sports. For
example, the same Sara may be a strong football player, an average basketball
player and a beginner volleyball player.

Therefore:

- player skill and sport-specific performance data belong to the player's
  membership in a particular roster, not globally to the person;
- football, volleyball, basketball and other materially different playing
  contexts should use separate rosters when their ratings/team-generation
  models differ;
- the same real person may appear in several rosters with independent ratings;
- Stripes must not combine unrelated sport ratings merely because the player
  identity is the same;
- future multisport work should preserve sport-neutral shared infrastructure
  while allowing sport-specific ratings, presets and generation strategies.

This has a direct subscription implication.

The current shared-workspace architecture is closely tied to a shared roster.
If paid Club access were permanently billed one subscription per roster, a
single multisport club correctly maintaining separate football, volleyball and
basketball rosters could be forced to buy three Club subscriptions simply
because player ratings must remain sport-specific.

That is not the intended long-term commercial model.

Future Club billing should therefore be capable of grouping multiple related
sport-specific shared rosters under one club/billing entity, so that a real
organization can maintain the correct separate roster structure without being
charged once per sport.

Working entitlement distinction:

- **Solo benefits follow the individual account/organizer.**
- **Club benefits should ultimately follow a club/billing grouping that can
  cover multiple related sport-specific shared rosters.**
- subscription or billing status must never grant superior organizer,
  governance or ownership authority.

Example:

- Joon, Jorge and Jan jointly organize football, volleyball and basketball for
  the same club;
- each sport has its own roster and independent player ratings;
- this should ultimately be representable as one paid Club relationship rather
  than three subscriptions solely because three sport rosters are required.

Do not solve this by merging different sports into one roster.

Deferred decisions include:

- the exact Club grouping/data model;
- how existing shared rosters become linked to a Club billing entity;
- the number of sport rosters included in a Club plan or any fair-use limit;
- exact Free / Solo / Club prices and Meetup-import allowances;
- whether governance remains roster-scoped or gains any future club-level
  coordination;
- downgrade and transfer mechanics for the future billing entity.

Do not implement this billing architecture during current G1 governance,
G1.5 onboarding or G2/G3 Google work unless a later roadmap phase explicitly
authorizes it.


### Competitive positioning

Stripes should not attempt to out-Spond Spond or replace Signal/WhatsApp.

Other services already provide substantial free:

- communication
- calendars
- RSVPs
- team administration
- basic collaboration

Stripes' differentiation is:

**Other apps help organize who's coming. Stripes helps organizers fairly run
what happens once they come—and preserves the decisions, responsibilities and
organizational memory that chat and event apps handle poorly.**

Protect these differentiators:

- rapid fair-team generation
- roster intelligence
- Meetup/OCR attendance-to-team workflow
- organizer-focused Attendance/conduct memory
- Equipment ownership
- lightweight durable Action Board
- voting/decisions
- Evolution/institutional memory
- small-club organizer collaboration without enterprise complexity

Do not rebuild general chat.

### Product decision test for future Free/Paid features

Before assigning a future feature to Free or Paid, ask:

1. Is this necessary to experience Stripes' core value?
   - If yes → generally Free.

2. Is it required for a small three-organizer team to genuinely collaborate?
   - If yes → generally Free.

3. Is the proposed paywall merely an artificial restriction?
   - If yes → do not use it.

4. Does the feature consume meaningful ongoing infrastructure or storage?
   - If yes → reasonable Paid candidate.

5. Is it primarily integration, automation, scale, storage or convenience?
   - If yes → strong Paid candidate.

6. Would removing it make Free feel like a demo?
   - If yes → keep it Free.

Long-term objective:

**Make free users genuinely like Stripes, let Stripes spread naturally between
organizers, and charge when a group has received enough value that €4.99 feels
obviously reasonable.**

<!-- STRIPES_CURRENT_ARCHITECTURE_START -->

# Current Architecture Checkpoint — Shared Workspace + Google Storage

Status: APPROVED PRODUCT / ARCHITECTURE DIRECTION

Recorded after the 2026-08-13 storage, Google Drive and shared-roster
governance review, and updated after the 2026-08-15 G2 preflight.

This section is the authoritative current direction where older roadmap
storage/ownership wording conflicts with it.

## Current phase status

- P0-P5 initial UI consolidation and regression pass are complete.
- P5 regression checks remain an ongoing launch gate for subsequent work.
- W1 Public Website / Launch Readiness is complete.
- W2 Meetup application is submitted / waiting for API access.
- Meetup must not block the Google Play launch.
- G1.4 protected organizer-removal governance is complete and live.
- G1.5e organizer governance eligibility hardening is released and live.
- G1.5f Authentication UX hardening is released on `main` as `984bb4e`.
- The discoverable Club-shell **Leave shared roster** action is released on
  `main` as `a79deb6`.
- G1.6 Workspace closure / last-organizer behavior is released on `main` as
  `61b3079` with its Firestore rules and callable Functions deployed.
- G1 Shared Workspace Governance is complete and released.
- Current major implementation phase: G2 Unified Google Connection.
- G2.1a Drive connection-state/auth foundation is implemented locally and
  awaiting review and real-account verification before G2.2 begins.

## Shared workspace governance

A shared roster is a club workspace.

It must not operationally belong to one permanent individual owner.

Approved direction:

- the person who creates the shared roster becomes the first organizer;
- `createdByUid` / founder metadata may remain for audit/history;
- creator status must not provide permanent superior day-to-day workspace
  rights;
- normal organizers should have equal operational rights within the club
  workspace;
- an organizer owns their membership, not the shared workspace itself;
- leaving the club removes only that organizer's membership;
- leaving must never delete the roster, players, ratings, Attendance,
  Equipment, Action Board, votes, Notes, history or shared resources;
- removal of one organizer must not make remaining organizers lose access to
  the club;
- the last-organizer case must be explicitly protected;
- the last organizer must not be able to accidentally orphan or silently
  destroy the workspace by using an ordinary Leave action;
- whole-workspace closure/deletion is a separate destructive governance
  action and must have stronger protection than ordinary editing;
- organizer-removal and workspace-closure rules should be finalized during G1
  rather than inherited from the old owner/editor model.

### Organizer removal governance

Removing another organizer is a protected governance action, not an ordinary
workspace edit.

Approved rules:

- an organizer may always leave the workspace themselves, subject to the
  last-organizer safeguard;
- one organizer may not unilaterally remove another organizer;
- removing another organizer starts a secret organizer ballot;
- the organizer whose removal is being considered is not eligible to vote;
- approval requires a strict majority of the TOTAL organizer count before
  removal;
- the approval threshold is therefore `floor(total organizers / 2) + 1`;
- as soon as the required Yes threshold is reached, removal is approved
  immediately; remaining votes are not required;
- the vote may also close early when enough No votes make the approval
  threshold mathematically unreachable;
- individual ballots are confidential;
- the organizer being considered for removal must never see who voted Yes or
  No;
- other organizers should also see only aggregate counts/outcome rather than
  individual ballot identities;
- governance history may retain the proposal and aggregate result, but not
  expose individual ballots.

Examples:

- 5 organizers total -> 3 Yes required; target does not vote;
- 4 organizers total -> 3 Yes required;
- 3 organizers total -> 2 Yes required;
- 2 organizers total -> 2 Yes required, but only one organizer is eligible to
  vote, so unilateral removal is naturally impossible.

This threshold rule intentionally protects two-organizer clubs without
inventing a separate unilateral-removal exception.

The exact ballot persistence/security implementation belongs to a later G1
atomic task. Do not implement organizer-removal voting as part of the initial
role-compatibility patch.

Do not rename or migrate Firestore collections merely to reflect terminology
unless the G1 audit demonstrates a real technical need.

## Google connection model

Stripes should present one coherent Google connection.

Do not create unrelated authentication experiences for:

- existing local roster backup;
- individual Google file attachment;
- Club Cabinet;
- future Google capabilities.

The user-facing Google connection may be coherent, but Firebase identity and
Google Drive authorization are separate security capabilities.

Firebase Google Sign-In:

- uses Firebase `GoogleAuthProvider` with identity-only scopes `openid`,
  `email` and `profile`;
- produces and preserves the existing Firebase UID/session;
- retains the current UID-preserving provider-conflict/account-link behavior;
- must never receive Google Drive scopes.

Google Drive authorization:

- currently uses the Google Identity Services browser token model;
- uses `https://www.googleapis.com/auth/drive.file` as the least-privilege G2
  baseline;
- currently flows from `App.tsx` through
  `requestGoogleDriveAccessToken()` to a short-lived browser access token used
  by Drive, Sheets and Picker APIs;
- keeps that token only in browser/React memory: it is not stored in Firestore,
  localStorage or URLs and is not intentionally logged;
- loses the token on refresh and does not store a refresh token.

G2 may improve explicit connection, expiry and reconnect state, but it must not
introduce durable OAuth-token storage without a separate security review.

A user's Firebase/Stripes identity and connected Google Drive identity may be
different. Stripes must never silently assume that the Firebase email equals
the connected Drive email. Show the active Drive identity where relevant, for
example: **Google Drive connected as maria@example.com**.

Continue using the narrowest permission that reliably delivers each approved
capability. Never silently broaden OAuth permissions.

### Existing Google implementation reuse direction

Extend:

- `src/lib/googleDriveConfig.ts`: preserve `drive.file` and add explicit
  capability/config handling where needed;
- `src/lib/googleDriveFiles.ts`: preserve existing Drive REST helpers and
  later extend them for Cabinet folders, pagination, permissions, `driveId`,
  capabilities and Shared Drive-aware parameters without breaking Cloud
  Backup;
- `src/lib/googleDrivePicker.ts`: preserve the Picker/script setup and later
  extend it for Cabinet folder/resource selection;
- `.env.example`: eventually document the relevant existing Google variables,
  including optional `VITE_GOOGLE_APP_ID` where appropriate.

Refactor incrementally:

- `src/lib/googleDriveAuth.ts`: retain GIS token acquisition while evolving it
  from one-off backup authorization into a reusable memory-only Drive
  connection lifecycle with account, granted scope, expiry, reconnect and safe
  disconnect state;
- `src/App.tsx`: move raw Drive connection responsibility into that reusable
  layer without disrupting working Cloud Backup behavior.

Reuse as-is:

- `src/lib/googleDriveBackup.ts`: its bounded backup serialization/parsing is
  independent from the connection architecture.

Retire later, while preserving historical compatibility:

- `src/lib/googleSheetsFiles.ts`;
- `src/lib/googleSheetsRoster.ts`;
- the hidden legacy Google Sheets roster UI and handlers.

Do not build G2/Cabinet on Google Sheets roster state. Firebase shared
workspace state remains canonical for club collaboration.

Do not touch during G2:

- Firebase Google identity implementation, policy, shared-roster auth UI or
  invitation onboarding auth;
- current Action Board Firebase attachment/storage behavior in
  `src/lib/clubResourceService.ts`, Task Board attachments and Firebase Storage
  rules/resources.

Existing Firebase-hosted attachments remain until the later G4 retirement
phase.

## Individual Google Drive resources

Users may attach/select individual files from My Drive or other Google
locations they can access.

For individually selected Google resources:

- Google remains the file owner and permission authority;
- Stripes stores only the resource reference, metadata and Stripes context;
- normal Google access-request behavior is acceptable;
- Stripes does not promise that every organizer automatically has access;
- Stripes must not silently move an externally selected original file;
- if an organizer lacks Google permission, Google should handle the access
  request;
- deletion, permission changes or loss of Google access should produce an
  unavailable/reconnect state rather than a fake local copy.

Ordinary pasted URLs remain supported independently.

## Full Club Cabinet managed storage modes

The full managed Club Cabinet must NOT require Google Workspace.

Club Cabinet should support two Google-backed storage modes beneath the same
Stripes Cabinet interface.

### My Drive Cabinet — universal mode

A normal Google account may host a managed Club Cabinet.

Stripes may create or connect a dedicated Cabinet folder in an organizer's
My Drive and manage real Google folders/files there.

In this mode:

- the full Stripes Club Cabinet organization layer remains available;
- Cabinet folders correspond to real Google Drive folders;
- files remain hosted by Google rather than Stripes;
- Google remains authoritative for ownership and permissions;
- the underlying Cabinet storage is associated with an individual Google
  account;
- other organizers require appropriate Google sharing permissions;
- organizer turnover therefore has weaker continuity than an
  organization-owned Shared Drive;
- hosting the Cabinet does NOT give that Google-account owner superior Stripes
  governance rights;
- Stripes workspace governance and Google file ownership remain separate;
- lost, revoked or disconnected Google access must produce a clear
  unavailable/reconnect/handoff state rather than a hidden local copy.

G2 must verify actual Google behavior for:

- sharing a managed My Drive Cabinet folder with multiple organizers;
- organizer create/upload/edit permissions;
- ownership of files created by different organizers;
- organizer turnover;
- reconnect or explicit handoff when the hosting organizer changes.

### Shared Drive Cabinet — organization-owned mode

If a club already has access to an eligible Google Workspace Shared Drive,
Stripes may connect the Cabinet there instead.

This is the preferred organizational mode where available because:

- files belong to the organization rather than an individual organizer;
- organizer turnover has stronger continuity;
- Google remains responsible for Shared Drive membership and permissions.

Shared Drive is an enhancement, not a prerequisite.

Stripes must NOT:

- require Google Workspace to use Club Cabinet;
- tell users they must purchase Google Workspace;
- make Workspace status part of Stripes organizer authority;
- remove the paid Cabinet organization experience merely because My Drive is
  being used.

A Workspace account alone does not guarantee that an eligible Shared Drive
exists.

### Product / monetization boundary

Stripes Club charges for Cabinet organization, context and workflow rather than
Google storage capacity or Google Workspace.

The user's Google account type determines the underlying ownership/storage
mode, not whether the user receives the Stripes Club Cabinet experience.

## Flexible real-world club roles

Stripes may record optional **Club roles / organizational titles** that
describe how a real club has already organized itself. Stripes does not decide
who becomes Treasurer, Chair, Board Member or another club officer; the club
uses its normal real-world process and Stripes records the result.

Use a compact set of suggested labels:

- Board Member;
- Chair / President;
- Vice Chair / Vice President;
- Treasurer;
- Secretary;
- Council / Advisory Board;
- Coach / Sports Lead;
- Equipment Manager;
- Events / Social;
- Membership / Communications;
- Custom.

An organizer may have multiple roles. Custom labels must always remain
available so a club can record titles such as **Council of Elders** without
forcing a large fixed taxonomy.

These roles are descriptive and operational metadata only. A club role must
never automatically:

- grant stronger Stripes governance authority;
- alter protected organizer-removal voting or bypass governance-eligibility
  rules;
- grant workspace-closure rights beyond the existing organizer rules;
- grant Google Drive access;
- make the organizer owner of the Stripes workspace;
- make a Treasurer or other title superior to another organizer inside
  Stripes.

Stripes organizer governance remains equal. Real-world roles explain
responsibility, not authority within the Stripes governance engine.

Cabinet may use a role as explanatory context, for example:

**2026 Budget**

Google Sheet · Finance

Added by Maria · Treasurer

Open in Google

That label does not grant Maria or anyone else Google permission. Google
sharing remains the security authority.

A club may optionally identify an organizer responsible for Cabinet,
documents, Finance or another collection. This is operational responsibility,
not higher Stripes governance status. Do not build a hard-coded Treasurer
permission system; the responsible person may be a Secretary, Board Member,
Document Officer or holder of a custom role.

## Cabinet management, ownership and location changes

In My Drive mode, one Google account may technically own or host the Cabinet
folder/files. That Google ownership must never make the host owner of the
Stripes workspace or give them superior Stripes governance rights.

If the Google host/manager leaves, treat it as a Google
access/handoff/reconnect problem. Do not automatically destroy or move Google
files. Later UX may explain **Cabinet managed through Maria's Google Drive**,
but that describes infrastructure responsibility, not club ownership.

Any active organizer may eventually configure or change the Cabinet connection
under the normal equal-organizer model. Replacing an existing location requires
explicit confirmation because it changes which Google location Stripes treats
as the Club Cabinet, for example:

**Change Club Cabinet?**

Stripes will stop using the current Google folder as the Club Cabinet.
Existing files will remain in Google Drive.

G2 must not create a new secret-ballot/governance system for Cabinet-location
changes. Changing Cabinet metadata must never delete the old Google folder or
its files.

## Cabinet folders

For a managed Club Cabinet, whether backed by My Drive or an eligible Shared
Drive:

- Cabinet folders correspond to real Google Drive folders;
- creating a Cabinet folder creates the corresponding Google Drive folder;
- renaming a Cabinet folder renames the real Google folder;
- moving a managed Cabinet file/folder updates its real Google Drive location;
- files uploaded through Cabinet are stored in the connected Cabinet folder;
- files uploaded contextually from Action Board / Equipment may be saved into
  an appropriate Cabinet location;
- one underlying Google file may remain connected to multiple Stripes contexts
  without duplication.

The storage mode affects Google ownership and continuity rather than the
Stripes concept of Cabinet organization.

Firestore continues to own Stripes-specific relationships such as:

- Used in Action Board;
- Used in Equipment;
- Pinned;
- originating Stripes context;
- resource metadata;
- organizer attribution;
- Stripes folder/context relationships where needed.

Google remains authoritative for the actual file and Google permissions.

## External / My Drive files inside Cabinet context

An existing externally selected My Drive file may be referenced from Stripes.

Stripes must not silently relocate the user's original My Drive resource.

Where useful, future implementation may use a reference/shortcut model, but
the original file's Google ownership and location remain under the user's
control.

Any explicit operation that would move/delete an external original must be
clearly distinguished from moving/removing its Stripes relationship.

## Stripes file-hosting boundary

Stripes should NOT provide general document/file hosting.

Do not use Firebase Storage as a Dropbox/Google Drive replacement for:

- PDFs;
- Word/OpenDocument files;
- receipts;
- Action Board document attachments;
- Club Cabinet documents;
- arbitrary club user files.

Firebase Storage may remain available for narrowly scoped Stripes-owned
application assets where synchronization is genuinely required.

Firestore remains the canonical database for Stripes application state,
metadata and contextual relationships.

Google remains the canonical file host for Google-connected documents.

## User-facing explanation

The Google/Cabinet setup must explain My Drive and Shared Drive without turning
setup into an IT lesson.

Provide concise contextual help, for example through a `?` information modal.

My Drive:
- works with a normal Google account;
- supports the normal managed Club Cabinet;
- files/folders remain associated with individual Google ownership;
- other organizers require appropriate Google sharing permissions;
- organizer turnover may require an explicit reconnect or handoff;
- the Google storage host receives no superior Stripes organizer rights.

Shared Drive:
- available when an organization already has access to an eligible Google
  Workspace Shared Drive;
- files belong to the organization rather than an individual organizer;
- provides stronger continuity when organizers change;
- recommended where already available;
- optional, not required for Club Cabinet.

Also state:

- Google Workspace is not required to use Stripes or Club Cabinet;
- Stripes does not sell or provide the underlying Google storage;
- Stripes does not override Google permissions;
- normal Google access-request behavior remains expected for private
  resources;
- Stripes should not tell users to purchase Google Workspace.

## Next implementation order

Do not begin Google Drive implementation before G1 governance reconciliation.

Approved sequence:

### G1 — Shared Workspace Governance

Audit and migrate the old owner/editor assumptions toward the approved
equal-organizer workspace model.

This includes:

- schema/role audit;
- Firestore rules;
- Firebase Storage rules where still relevant;
- invitation behavior;
- leave behavior;
- organizer removal;
- last-organizer handling;
- workspace closure/deletion;
- existing ClubResource assumptions.

#### G1 implementation checkpoint — 2026-08-13

Completed so far:

- repository-wide G1 ownership/governance audit completed from the committed
  project snapshot;
- legacy `owner` / `editor` assumptions confirmed across shared-roster
  services, UI, Firestore rules and Firebase Storage rules;
- `organizer` is now recognized as a backward-compatible normal editing role;
- legacy `owner` and `editor` records remain supported;
- no existing Firestore membership documents were migrated in this step;
- no creator, invitation, leave, organizer-removal or workspace-deletion
  behavior changed yet;
- Firebase Action Board document storage remains temporarily active until the
  Google-backed replacement exists;
- Firebase rules have not been deployed yet;
- production Vite build and `git diff --check` pass;
- the repository's existing TypeScript typecheck is not currently a clean
  verification gate because the committed `tsconfig.json` extends a missing
  workspace `tsconfig.base.json` and includes the stale `src/src` tree.
  This is pre-existing tooling debt and was not broadened into G1.1.

Next atomic task:

**G1.2 — equal-organizer creation/join semantics and safe-leave groundwork.**

G1.2 must not implement organizer-removal voting yet. Secret-ballot organizer
removal remains a later protected G1 governance task.

#### G1.2 implementation checkpoint — 2026-08-13

Completed:

- new shared-workspace creators are stored as equal `organizer`s rather than
  operational `owner`s;
- accepted group invitees become equal `organizer`s rather than `editor`s;
- legacy `owner` and `editor` records remain backward-compatible;
- `ownerUid` / `ownerEmail` remain only as legacy creator/history metadata and
  no longer independently grant active membership or save permission;
- active membership is authoritative: a user must still be present in
  `memberUids` before any legacy role fallback can apply;
- organizers can invite and cancel pending invitations;
- the old unilateral organizer-removal UI has been removed pending the
  protected organizer-vote flow;
- the old unilateral online workspace-delete UI has been removed;
- ordinary client deletion of shared groups and shared rosters is denied by
  Firestore rules pending a future governed workspace-closure flow;
- any organizer may leave a shared workspace without deleting shared data;
- leaving removes only that organizer's membership/role/name mappings from the
  group and linked rosters;
- the last remaining organizer cannot use the ordinary Leave flow;
- old owner-based delete service helpers remain dormant legacy code for now;
  they are no longer exposed by the UI and will be superseded by the governed
  workspace-closure implementation;
- Firebase Action Board document storage remains untouched;
- organizer-removal voting is not implemented in G1.2.

Verification:

- production Vite build passes;
- `git diff --check` passes;
- the repository's pre-existing TypeScript baseline issue remains separate
  tooling debt and is not part of G1.2.

Next atomic task:

**G1.3 — Firestore membership-transition hardening.**

G1.3 must enforce the governance model at the rules layer: legitimate invite,
invite acceptance and self-leave transitions remain possible, while one
organizer must not be able to directly remove another organizer by writing
membership fields.

Secret-ballot organizer removal remains the following protected G1 task.

#### G1.3 implementation checkpoint — 2026-08-13

Completed:

- Firestore now treats shared-workspace membership/access fields as protected
  governance state rather than ordinary organizer-editable data;
- normal organizers may continue editing shared workspace content without
  rewriting membership, roles or creator-history metadata;
- organizers may add or cancel pending invitation emails without directly
  changing existing organizer membership;
- a pending invitee may accept only their own invitation and add only
  themselves as an equal `organizer`;
- invite acceptance cannot be used to alter another organizer's membership,
  role or identity mappings;
- linked-roster invite acceptance derives membership maps from each roster's
  own current state and changes only the accepting organizer's keys, preserving
  compatibility with older workspaces whose group/roster metadata may differ;
- an organizer may use the ordinary Leave flow to remove only themselves;
- self-leave must remove the signed-in organizer's own UID/email/role/name
  mappings and cannot directly remove another organizer;
- Firestore requires another organizer to remain after an ordinary self-leave;
- legacy creator records remain compatible while the creator is still an
  active member: `ownerUid` may provide a legacy organizer fallback, but it
  does not independently restore access after membership is removed;
- `ownerUid` / `ownerEmail` remain immutable legacy creator/history metadata;
- ordinary client deletion of shared groups and rosters remains blocked;
- unilateral organizer removal remains blocked pending the protected ballot
  implementation;
- Firebase rules dry-run compilation passes.

#### G1.4 implementation completion checkpoint — 2026-08-13

Completed:

- organizer removal is now a protected governance action rather than a normal
  shared-workspace membership edit;
- one organizer cannot directly remove another organizer through ordinary
  Firestore membership writes;
- organizer-removal proposals and ballots are handled through trusted backend
  governance logic rather than exposing direct membership mutation to clients;
- the target organizer is excluded from the eligible electorate;
- the approval threshold is fixed at
  `floor(total organizer count / 2) + 1`, based on the TOTAL organizer count
  including the target;
- a proposal passes immediately when the required Yes threshold is reached;
- a proposal fails early when the remaining possible Yes votes can no longer
  reach the threshold;
- the two-organizer case therefore cannot produce unilateral removal:
  2 total organizers require 2 Yes votes while only one organizer is eligible
  to vote;
- removal resolution strips the target organizer's active membership/access
  mappings while preserving unrelated shared workspace data;
- organizer-removal logic is separated into dedicated backend governance code;
- a dedicated client governance service provides the Stripes-facing proposal
  and voting interface;
- organizer-removal UI is wired into the shared-workspace organizer controls;
- protected ballot data is treated as governance/security data rather than
  ordinary Action Board voting data;
- governance results expose only the information required by the organizer
  workflow; individual ballot identities must not become normal shared club
  data or governance history;
- aggregate proposal history is readable only by active organizers, while a
  target may read only the specific proposal naming their UID;
- electorate snapshots, active-proposal control data and individual ballot
  documents are server-only under Firestore rules;
- callable participation checks authorize only active organizers or the
  proposal target and reveal only the requesting user's own eligibility and
  participation state;
- legacy creator fallback remains available only when the active member has no
  explicit role, so an explicit non-organizer role cannot inherit organizer
  authority from historical `ownerUid` metadata;
- successful removal resolves and removes the target's roster-specific email
  mapping for each linked roster, including compatible legacy metadata;
- the old direct client organizer-removal export is now a non-mutating
  compatibility guard that requires callers to use the protected ballot flow;
- the proposal confirmation no longer estimates organizer totals or thresholds
  from client display arrays; authoritative counts come from backend electorate
  calculation;
- ordinary organizer self-leave remains a separate flow;
- whole-workspace closure/deletion remains a separate future governed action;
- Firebase Action Board document attachment storage remains untouched by G1.4.

Verification completed on the final implementation:

- all 15 dedicated organizer-removal unit tests pass;
- threshold behavior is covered for 2, 3, 4 and 5 organizers;
- early-pass and mathematically-unreachable early-fail behavior is tested;
- membership-removal behavior is tested to preserve unrelated workspace data;
- linked-roster cleanup with a roster-specific legacy email is tested;
- Firebase Functions source syntax validation passes;
- production Vite build passes;
- Firestore rules dry-run compilation passes;
- dry-run validation passes for all three G1.4 callable Functions;
- the focused TypeScript audit reports no errors in G1.4 files; the repository's
  documented pre-existing typecheck baseline remains separate;
- `git diff --check` passes.

Deployment / live status:

- G1.4 implementation is complete and final-reviewed against the approved
  governance rules;
- committed as `2c3a4263dd8b6338e022474ab466ace61c216612`;
- pushed to `main` / `origin/main`;
- Vercel production deployment succeeded and `stripes.work` serves the G1.4
  production bundle;
- G1.4 Firestore rules are deployed to Firebase project `fair-teams-dev`;
- all three G1.4 callable Functions are deployed in `europe-west1`;
- all 15 organizer-removal tests passed before deployment;
- production build, Firestore dry run, Functions dry run and diff checks
  passed;
- the repository's known TypeScript baseline errors remain separate, with no
  focused G1.4 errors.

Remaining launch validation:

- perform true multi-account end-to-end governance testing with several real
  organizer accounts;
- verify the target cannot vote;
- verify ballots cannot be changed;
- verify no organizer can see ballot identities;
- verify turnout updates without exposing live Yes/No totals;
- verify pass/fail thresholds at realistic organizer counts;
- verify successful removal revokes access across linked rosters;
- verify self-leave remains a separate workflow.

Next approved atomic task:

**G1.5 — Organizer invitation + verified-email onboarding.**

The invitation experience should become a complete onboarding flow rather than
only a pending-email database state.

Required product behavior:

1. An organizer enters an email address and chooses **Invite organizer**.
2. Stripes creates the pending workspace invitation.
3. Stripes sends a short branded invitation email from the Stripes domain.
4. The email identifies the inviting organizer and club/workspace and provides
   one clear **Join [club]** action.
5. The invitation link preserves enough invitation/workspace context for the
   recipient to continue directly into the correct Stripes workspace.
6. If the recipient does not yet have a Stripes account, they create one using
   the invited email address.
7. The invited email must be verified before shared-workspace organizer access
   is granted.
8. If the recipient already has a Stripes account with the verified invited
   email, signup is skipped and they continue directly to invitation
   acceptance.
9. Acceptance makes the recipient an equal `organizer` under the G1 governance
   model.
10. A user signed in with a different email must not be able to consume another
    person's invitation.

Email / account requirements:

- invitation email branding must say Stripes, not legacy Fair Teams branding;
- account-verification, password-reset and related Firebase Authentication
  emails must be audited for Stripes branding;
- email action links should return users to the current Stripes domain/flow;
- actual test emails should be sent before launch;
- failed, expired, already-consumed and wrong-account invitation states should
  have clear recovery UX;
- invitation email sending must not expose secrets or make the client a trusted
  email-sending authority.

Security / privacy requirements:

- verified email identity must match the invited normalized email;
- backend enforcement is required; UI-only checks are insufficient;
- invitation data should contain only what is needed for the onboarding flow;
- invite links/tokens must not themselves grant organizer access without
  successful authentication and verification;
- G1.5 must be reviewed against the Security & Privacy Launch Gate.

### Pending invitation membership boundary

A pending organizer invitation is onboarding state only. It is **not workspace
membership**.

Until the recipient successfully verifies the invited identity and explicitly
accepts the invitation:

- the recipient is not an organizer/member;
- the pending email must not appear in normal **Send notification** recipient
  lists;
- the recipient must not receive Action Board, voting, Equipment, club or
  other ordinary workspace notifications;
- the recipient must not be counted for organizer collaboration or governance
  behavior;
- the recipient may receive only invitation/onboarding-related email;
- sanitized invitation context is the only workspace information available
  before acceptance.

After successful acceptance, the new organizer becomes eligible for normal
organizer notifications and collaboration behavior through active workspace
membership.

Cancelled, expired, stale, legacy or otherwise unaccepted invitations must
never create ordinary notification recipients.

Core invariant:

**Pending invitation != workspace membership.**

G1.5 should remain independent from G2/G3 Google integration work.

#### G1.5a implementation checkpoint — 2026-08-14

Implemented and verified locally; intentionally not deployed independently:

- organizer invitations now have opaque server-created records under
  `sharedWorkspaceInvitations/{invitationId}`;
- invitation records and their deduplication controls are denied to all
  direct Firestore clients;
- trusted callable Functions create, reuse, resend, cancel, list and expose
  minimal invitation context;
- invitation creation rejects self-invites, existing organizers,
  unauthenticated callers, unverified senders and callers who are not active
  organizers;
- pending invitations expire after 14 days;
- duplicate pending invitations reuse the same opaque invitation and resend
  reuses that invitation with a five-minute minimum cooldown;
- invitation links are constructed only by the backend as
  `https://stripes.work/app?invite=<opaque-id>`;
- public invitation context exposes only the sanitized workspace name,
  inviter display name, state, expiry and masked invited email;
- invitation emails use the existing
  `Stripes <notifications@stripes.work>` Resend sender with short Stripes
  plain-text and HTML content;
- Action Board-specific email headers are now optional and are omitted from
  organizer-invitation email;
- the organizer UI uses the callable backend and shows pending, delivery,
  resend and cancel state;
- legacy `pendingInviteEmails` values remain synchronized and legacy pending
  entries can be adopted by the new email flow;
- invitation acceptance, recipient verification/navigation, password-reset
  work and legacy direct-acceptance rule hardening remain out of G1.5a.

Verification:

- all focused organizer-removal and invitation policy tests pass;
- production Vite build passes;
- Firestore rules dry-run compilation passes;
- dry-run validation passes for all five G1.5a callable Functions;
- the repository's documented TypeScript baseline errors remain, with no
  errors reported in the G1.5a files.

#### G1.5b implementation checkpoint — 2026-08-14

Implemented and verified locally; intentionally not pushed or deployed:

- incoming organizer invitations are now listed through a trusted callable
  that derives the recipient identity only from an authenticated, verified
  Firebase token and returns sanitized invitation summaries;
- organizer invitation acceptance now runs in an Admin SDK Firestore
  transaction and requires an authenticated, verified token email that exactly
  matches the normalized pending invitation recipient;
- acceptance atomically re-reads the invitation, deduplication lock, workspace
  and all currently linked rosters before adding the recipient as an equal
  organizer, updating identity/name mappings and removing the pending email;
- accepted invitations retain minimal server-only outcome metadata and their
  active deduplication lock is removed;
- cancelled, expired, consumed, wrong-account, unverified, already-member and
  invalid-lock acceptance attempts fail without granting membership;
- legacy `pendingInviteEmails` entries are adopted into opaque server-only
  invitation records for verified matching recipients without restoring direct
  Firestore read or acceptance authority;
- pending recipients can no longer read full shared workspace or roster
  documents before joining;
- normal organizer writes can no longer change `pendingInviteEmails`, and the
  former direct client invitation query, mutation and acceptance APIs are
  retained only as fail-closed compatibility guards for the tracked stale
  source tree;
- self-leave and protected organizer removal clear the departing organizer's
  matching pending invitation identity while preserving unrelated invitations;
- a server invitation is reusable only while the authoritative workspace still
  considers its recipient pending; a later deliberate reinvite cancels stale
  server state and creates a fresh opaque invitation;
- invitation links remain contextual identifiers and never grant membership
  by themselves;
- ordinary workspace notification eligibility follows active membership rather
  than pending invitation state: pending invitees must not appear in normal
  Send notification recipient lists or receive ordinary workspace
  notifications before acceptance.

Verification:

- all 53 focused organizer-removal, invitation, acceptance,
  notification-recipient and Firestore-rule contract tests pass;
- production Vite build passes;
- Firestore rules dry-run compilation passes;
- dry-run validation passes for all seven G1.5 invitation callable Functions;
- the documented TypeScript baseline errors remain, with no errors reported in
  the G1.5b frontend files.

#### G1.5c-1 foundation checkpoint — 2026-08-14

Implemented and verified locally; intentionally not pushed or deployed:

- the sanitized invitation-context callable now derives one of four viewer
  states from Firebase authentication server-side: `signed_out`,
  `wrong_email`, `matching_unverified` or `matching_verified`;
- viewer status uses normalized token email matching and never exposes the
  full invited email; the existing masked email remains the only recipient
  identity included in public invitation context;
- viewer status is contextual UX information only and does not replace the
  trusted verified-identity checks performed during invitation acceptance;
- a focused client auth helper now provides Firebase hosted-handler action
  settings for the fixed Stripes `/app` return URL and validated
  `/app?invite=<opaque-id>` invitation continuation URL;
- the auth helper supports verification email, password-reset email, Firebase
  user reload and forced ID-token refresh without probing whether an account
  exists;
- the shared Firebase organizer identity now carries `emailVerified`, allowing
  the existing invitation surface to distinguish a ready organizer from one
  who must verify before sending invitations while preserving all existing
  consumers;
- email verification remains scoped to shared-workspace invitation actions;
  normal solo/local Stripes and team generation are not verification-gated;
- full invitation landing/auth forms, verification/reset UI, explicit Join,
  App query/history integration, guided-tour handling and accepted-roster
  opening remain for G1.5c-2/G1.5c-3.

Verification:

- all 57 focused organizer-removal, invitation, acceptance,
  notification-recipient, viewer-status and Firestore-rule contract tests
  pass;
- production Vite build passes;
- the changed invitation-context callable passes Firebase Functions dry-run
  validation;
- focused TypeScript review reports no errors in the G1.5c-1 frontend files;
  the documented repository-wide TypeScript baseline errors remain separate;
- Firestore rules were not changed by G1.5c-1.

#### G1.5c-2 onboarding UI checkpoint — 2026-08-14

Implemented and verified locally; intentionally not pushed or deployed:

- a dedicated `WorkspaceInvitationOnboarding` component now models loading,
  unavailable, expired, cancelled, already-used, signed-out, wrong-account,
  matching-unverified and matching-verified invitation states;
- signed-out recipients can switch between existing Firebase sign-in and
  account creation while preserving the entered email, password-reset uses
  the invitation-aware hosted Firebase action flow, and confirmation remains
  generic so account existence is not disclosed;
- new accounts request verification only after refreshed server invitation
  context confirms `matching_unverified` rather than trusting a client-side
  email comparison;
- verification continuation reloads the Firebase user, forces an ID-token
  refresh and re-fetches server context before exposing Join;
- joining remains an explicit action available only for server-confirmed
  `matching_verified` context and uses the trusted G1.5b acceptance callable;
- duplicate Join submission is guarded, and the complete acceptance result is
  retained and passed through the component callback so later App handoff can
  recover without attempting acceptance again;
- the existing organizer invitation surface now gives unverified organizers
  compact Send verification email and I’ve verified — continue actions using
  the normal `https://stripes.work/app` continuation rather than surfacing an
  unexplained backend failure;
- invitation management remains available normally for verified organizers;
  no solo/local application capability is verification-gated;
- `App.tsx`, invitation query parsing, browser history, guided-tour handling
  and accepted-workspace opening remain unchanged for G1.5c-3.

Verification:

- all 7 focused onboarding-state and sender-readiness tests pass;
- all 57 G1.5 governance/invitation tests continue to pass;
- production Vite build passes;
- focused TypeScript review reports no errors in the G1.5c-2 files; the
  documented repository-wide TypeScript baseline errors remain separate;
- no backend Function or Firestore rule changed in G1.5c-2.

Next atomic task:

**G1.5c-3 — App integration, invitation continuation, accepted-workspace
opening, history and guided-tour handling.**

#### G1.5c-3 App integration checkpoint — 2026-08-14

Implemented and verified locally; intentionally not pushed or deployed:

- `/app?invite=<opaque-id>` now validates the invitation ID with the shared
  opaque-ID rule and mounts the existing onboarding component in a dedicated
  full-page Stripes flow without introducing a router or changing the current
  application tab;
- invalid invitation query values fail closed and are removed without changing
  unrelated query parameters, the URL hash or `history.state`;
- active invitation flows suppress the first-run guided tour without writing
  onboarding completion state, while normal tour eligibility resumes after the
  invitation flow ends;
- terminal Continue actions remove only the invitation query value with
  `history.replaceState`, so opening or leaving the flow does not add an
  invitation-specific browser-history entry;
- successful trusted acceptance tries the returned linked roster IDs in order,
  reads the first available roster through the existing authenticated Firebase
  path, opens/links it through the established App state behavior and removes
  the invitation query only after that handoff succeeds;
- a failed roster handoff leaves the invitation context mounted so Continue can
  retry the retained acceptance result without invoking acceptance again;
- already-used invitations remain a neutral terminal state and do not infer or
  automatically open workspace access;
- no backend Function, Firestore rule, persistence schema or normal solo/local
  capability changed in G1.5c-3.

Verification:

- all 12 focused onboarding/App-flow tests pass, including the existing seven
  G1.5c-2 state and sender-readiness tests;
- all 57 G1.5 governance/invitation tests continue to pass;
- production Vite build passes;
- focused TypeScript review reports no new errors in the G1.5c-3 logic; the
  documented repository-wide TypeScript baseline errors remain separate;
- no Functions or Firestore rules changed, so no new backend/rules dry run was
  required for this frontend-only checkpoint.

Next atomic task:

**G1.5d — Firebase/Resend branding and action-link configuration,
deliverability checks and live multi-account invitation verification.**

G1.5a–G1.5c were released together after recipient verification/onboarding was
completed locally; G1.5d now owns coordinated production verification.

#### G1.5d live-test checkpoint — 2026-08-14

**Status:** In progress.

- coordinated G1.5 live testing has begun on `stripes.work` with the invitation
  Functions and hardened Firestore rules deployed to `fair-teams-dev` in
  `europe-west1`;
- sender verification passed in production: an unverified organizer can request
  Firebase verification, return to Stripes and unlock invitation management
  after refreshing the verified identity;
- the production Firebase verification email was delivered to Spam, so
  verification-email branding and deliverability remain an explicit G1.5d
  follow-up;
- live testing found that a legacy `pendingInviteEmails` row could show an
  enabled **Send email** action that appeared to do nothing;
- the confirmed frontend root cause was a silent `handleInvite()` return when
  the separately loaded group summary was unavailable even though the shared
  roster/source already carried the canonical workspace group ID; invitation
  listing refresh, Resend refresh and Cancel shared the same unnecessary group
  object dependency;
- the local fix resolves one canonical invitation-management group ID from the
  roster, matching loaded group or active Firebase source, uses it for all four
  organizer invitation paths and shows explicit in-modal success/failure state;
  a genuinely missing workspace identity now fails visibly instead of silently;
  this first invitation hotfix is deployed;
- continued production testing exposed a second sender-verification issue: an
  organizer successfully verified, initially became recognized as verified,
  but a later invitation action was rejected as verification-required;
- the confirmed cause was two unsynchronized Firebase Auth representations:
  each mounted shared-roster card kept its own `SharedRosterUser` snapshot from
  `onAuthStateChanged`, which does not emit same-UID reload/token changes, while
  invitation actions trusted that React snapshot without reconciling the ID
  token claim used by the authoritative backend;
- the narrow local fix listens to Firebase ID-token changes centrally, verifies
  refreshed identity state against the forced token's `email_verified` claim
  and refreshes that identity once immediately before Invite, legacy Send
  email, Resend or Cancel; the backend verified-sender rule is unchanged;
- the verified-sender refresh fix has now passed production re-testing, and a
  live organizer invitation email was sent successfully;
- that live send exposed a naming defect: historical shared groups may retain
  the placeholder `My Group` while the authoritative group metadata already
  records a meaningful `lastSavedRosterName`; invitation creation previously
  snapshotted the placeholder without applying a meaningful-name fallback, so
  both the Resend email and recipient onboarding repeated the wrong name;
- the deployed server-side correction now resolves invitation names from a
  meaningful workspace name first, then the current shared-roster name, then a
  neutral `Stripes workspace` fallback; create, resend, recipient context/list
  and acceptance handoff share that resolution, allowing existing pending
  invitations to benefit safely without exposing workspace documents;
- the core organizer invitation/onboarding path has now passed real production
  testing: a verified organizer can send an invitation; the email and an
  existing pending invitation context resolve the correct meaningful
  workspace/roster name; a signed-out recipient can open the invitation, sign
  in or create the invited account, verify that identity and explicitly join;
  verification does not auto-join; successful Join creates a normal equal
  operational organizer and the accepted shared workspace/roster loads;
- the full G1.5d matrix is not yet complete. Still-pending live-account cases
  include the existing matching verified/unverified account variants,
  wrong-account recovery, password reset, cancelled/expired/already-used links,
  failed/offline roster-handoff Retry and mobile browser/PWA Back behavior;
- Firebase Authentication verification emails currently use the Firebase
  project identity/domain rather than `stripes.work`, and those messages have
  landed in Spam during multiple real-account tests;
- password-reset branding and deliverability must be reviewed together with
  verification-email branding and deliverability;
- Resend organizer-invitation emails currently show no Stripes sender avatar;
  sender-avatar/BIMI/DNS work is deferred until the functional flow is stable;
- do not casually alter SPF, DKIM or DMARC while addressing Firebase Auth email
  branding because `stripes.work` already has production Resend DNS
  configuration;
- G1.5d remains **In progress** until the remaining live-account cases and the
  Firebase Auth/Resend email-branding and deliverability follow-ups are
  explicitly closed.

### G1.5e — Organizer governance eligibility hardening

**Status:** Released and live.

Live testing identified a governance-sybil risk: one human organizer could
invite several additional email accounts they control, accept those
invitations, manufacture a voting majority and use protected
organizer-removal voting against legitimate organizers.

A verified email proves control of an email address. It does not prove a
unique human identity. Stripes must not attempt privacy-heavy identity
detection such as device fingerprinting, IP matching or document verification
to solve this problem.

Locked product rule:

- a newly accepted organizer receives normal operational organizer access
  immediately;
- protected organizer-removal governance eligibility begins 14 days after
  invitation acceptance;
- during that 14-day period the organizer remains a normal operational
  organizer, but cannot start an organizer-removal proposal, cannot cast an
  organizer-removal ballot and is not counted in the eligible removal
  electorate or removal threshold;
- after 14 days, governance eligibility activates automatically;
- organizers who already predate this feature remain governance-eligible;
- governance-eligibility timestamps must be server-authoritative.

For G1.5e, the earlier removal-threshold wording is qualified by governance
eligibility: the existing threshold formula applies to the frozen total of
governance-eligible organizers, and organizers still inside the 14-day waiting
period are excluded from that total and threshold.

Locked small-electorate rule:

- a protected organizer-removal proposal may be created only when at least two
  governance-eligible organizers exist at proposal creation;
- `requiredYes = floor(eligibleGovernanceOrganizerCount / 2) + 1`;
- when the target is governance-eligible, the target remains in the frozen
  eligible count but cannot vote, preserving the existing two-organizer
  protection;
- a waiting-period organizer may be targeted but is excluded from the eligible
  count, so at least two other governance-eligible organizers are required to
  start that proposal;
- this is not blanket 14-day immunity: two eligible organizers may unanimously
  remove a waiting-period organizer.

Proposal stability rules:

- the eligible removal electorate is frozen when a proposal is created;
- organizers added after proposal creation cannot participate in that
  proposal;
- an organizer whose 14-day waiting period expires after proposal creation
  cannot join that already-open vote;
- the target remains unable to vote;
- existing secret-ballot privacy, aggregate-result visibility, threshold,
  immediate-pass and mathematically-unreachable early-fail rules remain
  unchanged.

Acceptance notification requirement:

- accepting an organizer invitation sends existing active organizers one
  transactional **new organizer joined** email;
- the email identifies the new organizer, the inviter where known, the
  workspace/club name, the acceptance date, that normal organizer access is
  immediate and that protected-removal governance eligibility begins after
  14 days;
- pending invitations do not trigger this notification;
- the newly accepted organizer is excluded from notification recipients.

Release checkpoint:

- trusted invitation acceptance atomically records server timestamps for the
  organizer's join time and 14-day governance-eligibility time on the shared
  workspace while granting operational access immediately;
- active legacy organizers without eligibility metadata remain eligible, while
  malformed explicit metadata fails closed;
- protected-removal creation and ballot callables enforce current eligibility,
  store a private frozen eligible UID set and apply the locked small-electorate
  rule without exposing voter identity;
- self-leave and protected removal clear the departing organizer's governance
  timing metadata, and Firestore rules deny direct client mutation except for
  the signed-in organizer's own removal during an otherwise valid self-leave;
- existing active organizers receive the transactional joined-organizer email
  after acceptance; delivery failure is recorded but cannot roll back accepted
  membership;
- the organizer-management UI shows the eligibility date and disables only the
  protected-removal controls during the waiting period;
- focused helper, governance, invitation, rules-contract and UI-state coverage
  accompanies the implementation;
- committed as `e4010e2` and pushed to `main`;
- the G1.5e Firestore rules are deployed;
- `acceptWorkspaceOrganizerInvitation`, `startOrganizerRemovalProposal`,
  `getOrganizerRemovalState` and `castOrganizerRemovalBallot` deployed
  successfully.

### G1.5f — Authentication UX hardening

**Status:** Released on `main` as `984bb4e`. Firestore rules and the
`sendStripesEmailVerification` Function were deployed before the frontend
release. Production Google testing still requires manual Firebase Console
provider enablement.

Bounded authentication direction:

- Google is the preferred Stripes sign-in method; email/password remains a
  supported fallback;
- Firebase Google authentication is identity-only and remains separate from
  Google Drive authorization and all G2 scopes/capabilities;
- popup sign-in preserves the current `/app?invite=<opaque-id>` browser state;
- provider/account conflicts never trigger automatic account merging,
  Firestore data migration or UID replacement;
- when signed-out Google authentication returns Firebase's supported
  existing-provider conflict, Stripes keeps only that exact pending credential
  briefly in memory, requires authentication through the matching existing
  email/password account, then links with `linkWithCredential` so the existing
  UID is preserved;
- Stripes does not expose a generic authenticated Google-link popup, persist
  pending OAuth credentials or rely on post-link unlink cleanup;
- invitation matching remains backend-enforced against the exact normalized,
  verified Firebase email, and authentication never auto-accepts an
  invitation; explicit Join remains required;
- email/password verification uses a Firebase Admin-generated verification
  action link delivered through the existing Resend sender
  `Stripes <notifications@stripes.work>`;
- Firebase Authentication remains the verification authority, and the client
  continues to reload the Firebase user and force-refresh the ID token after
  verification;
- the verification callable is restricted to the signed-in Firebase UID and
  server-derived email, never returns or logs the raw action link, and stores
  its throttle state in a server-only Firestore document;
- verification resend policy is server-authoritative: at least 60 seconds
  between requests and at most 10 requests per rolling 24 hours per Firebase
  UID;
- custom password-reset delivery through Resend is deferred; the existing
  Firebase hosted password-reset flow remains in place;
- production Google testing still requires enabling the `google.com` provider
  in Firebase Authentication. No Google Drive scope or provider configuration
  change is part of G1.5f implementation.

### G1.6 — Workspace closure / last-organizer behavior

**Status:** Released on `main` as `61b3079`. Firestore rules and the
`getSharedWorkspaceClosureState` and `closeSharedWorkspace` callable Functions
were deployed with the release.

Implementation checkpoint:

- ordinary **Leave shared roster** remains membership-only and remains blocked
  for the last organizer;
- the Organizer/Club shell explains that the last organizer must invite
  another organizer before leaving or use the separate **Close shared
  workspace** action;
- closure is available only to the sole active organizer and requires the
  authoritative workspace name to be typed explicitly;
- `getSharedWorkspaceClosureState` provides server-authoritative closure
  eligibility, while `closeSharedWorkspace` rechecks organizer membership and
  the one-organizer invariant in an Admin SDK transaction;
- the transaction deletes the authoritative group/standalone-roster parent and
  every roster whose own `groupId` links it to the closing group, so membership
  changes and invitation acceptance cannot race past closure;
- a server-only cleanup checkpoint makes post-transaction cleanup retryable by
  the same organizer without granting any client access; unfinished cleanup is
  rediscovered through a trusted callable using a locally known linked roster
  ID, so recovery survives browser refresh/app restart after parent deletion;
- recursive Firestore cleanup removes workspace descendants, including Action
  Board, Equipment, attendance, ratings, notes, resources, backups and
  governance state;
- top-level invitation records, deduplication locks and Action Board
  notification-thread metadata are removed by authoritative workspace/scope
  identifiers;
- only canonical Stripes-uploaded Storage paths under
  `sharedRosters/{rosterId}/resources/` are deleted; user identity/push records,
  unrelated workspaces and private local rosters remain outside the boundary;
- invitation context now fails closed as soon as its workspace parent is no
  longer available;
- successful closure removes only linked opened copies from the current device,
  returns the app to a safe local roster state and reports **Shared workspace
  closed.**;
- direct client group/roster deletion remains denied; the temporary closure
  checkpoint collection is also server-only.

G1 Shared Workspace Governance is complete and released. Its final model
preserves equal normal organizers, protected organizer removal, hardened
verified-email invitations, the 14-day protected-removal eligibility delay,
the last-organizer ordinary-Leave safeguard and a separate deliberate
server-authoritative workspace-closure flow. Closure recursively removes
Stripes workspace data, uses a durable server-only cleanup checkpoint so failed
cleanup remains retryable after reload, and keeps direct client workspace
deletion denied.

Required roadmap order:

1. G1 Shared Workspace Governance — complete and released;
2. G2 Unified Google Connection — current implementation phase;
3. G3 Google Resource + Club Cabinet Foundation;
4. later G4 retirement/migration of existing Firebase-hosted Action Board
   attachments after the Google-backed replacement is proven.

Do not insert another major implementation phase between G1 and G2.

### Security & Privacy Launch Gate

**Status:** Required before public production launch / Google Play release.

This gate does not block normal implementation of G1–G3, but Stripes must not
be considered launch-ready until every mandatory item below is resolved and
documented.

#### Security and privacy principles

- collect and retain only personal data Stripes actually needs;
- Firebase/Google platform encryption at rest and in transit is the baseline;
  do not assume that ordinary Firestore fields are end-to-end encrypted;
- authorization must be enforced by backend security rules, not only hidden
  or disabled UI controls;
- organizer membership must remain workspace-governed and server-enforced;
- `ownerUid` / `ownerEmail` are legacy creator/history metadata only and must
  never independently restore access;
- use least-privilege Google OAuth scopes and permissions;
- Stripes should not become a general-purpose document-storage provider;
- minimize duplication of identity information such as organizer email
  addresses across Firestore documents;
- where practical, workspace membership should become the authoritative source
  of organizer identity/access rather than independently copied roster-level
  membership records.

#### Firebase Authentication and account security

Principles:

- Stripes does not store users' plaintext passwords; Firebase Authentication
  remains responsible for password verification and credential handling;
- a Firebase UID is an identifier, not a secret, and security must never depend
  on hiding it;
- knowing another user's UID must not grant access;
- Firestore rules and callable/backend authorization remain authoritative;
- sensitive operations must validate authenticated identity, active membership
  and the required role server-side;
- authenticated session/token theft is a more relevant threat than UID
  disclosure.

Mandatory Firebase Auth/account-security checks before launch:

- [ ] **Password policy**
  - inspect the actual Firebase Authentication password policy;
  - decide and enforce an appropriate production minimum and requirements;
  - do not assume Firebase defaults are sufficient.

- [ ] **Email-enumeration protection**
  - review and enable Firebase email-enumeration protection unless a documented
    incompatibility prevents it;
  - this was deferred during G1.5 live testing and must be revisited before
    public launch.

- [ ] **Sign-in and authentication-abuse protection**
  - review Firebase protections and rate limits for repeated sign-in,
    password-reset and verification attempts;
  - confirm invitation endpoints are also appropriately rate-limited and
    resistant to abuse.

- [ ] **Session and token handling**
  - review ID-token and refresh-token lifecycles;
  - verify sign-out and revocation behavior;
  - verify sensitive operations do not trust stale client-only authentication
    state;
  - ensure access and refresh tokens are never logged or stored in
    inappropriate shared persistence.

- [ ] **Backend authorization penetration-style checks**
  - attempt access using another known UID;
  - attempt to read or write another workspace by manually changing document
    or workspace IDs;
  - invoke protected callables as non-members and organizer-only callables as
    ordinary members;
  - attempt to consume an invitation from the wrong account and to reuse stale,
    cancelled or expired invitations;
  - attempt to modify membership/governance fields directly from a client;
  - attempt to access another club's private ratings, attendance and resources;
  - every attempt must fail closed regardless of the UI.

- [ ] **Account recovery and email infrastructure**
  - test verification and password reset end-to-end;
  - improve Firebase Auth email branding, domain alignment and deliverability;
  - document transactional email providers and sending domains;
  - ensure Firebase Auth DNS changes do not break the existing Resend SPF,
    DKIM or DMARC configuration.

#### Mandatory pre-launch checklist

- [ ] **Personal-data inventory**
  - document what Stripes stores, where it is stored, why it is needed and who
    can access it;
  - include organizer/account emails, player names, private organizer ratings,
    attendance, tardy/no-show/last-minute-cancellation records, notifications,
    governance records and Google-linked resource metadata.

- [ ] **Data minimization review**
  - identify duplicated personal information that can be removed or replaced
    by workspace/member references;
  - specifically review `memberEmails`, `memberNamesByEmail`,
    `memberUidByEmail` and linked-roster membership replication.

- [ ] **Backend authorization audit**
  - review Firestore, Firebase Storage and callable/backend-function rules;
  - verify that users cannot bypass the Stripes UI to read or modify another
    workspace's private data;
  - verify organizer invitation, invite acceptance, self-leave, removal voting
    and workspace closure at the backend rules layer.

- [ ] **Sensitive club-record review**
  - explicitly review privacy treatment of private player ratings, attendance,
    tardiness, no-shows, cancellations and any conduct-related records;
  - define who can see them and whether every stored field is necessary.

- [ ] **Retention and deletion policy**
  - define how long account, workspace and historical club data are retained;
  - provide a safe process for account deletion, leaving a workspace and
    eventual workspace closure;
  - ensure abandoned data is not retained indefinitely without a reason.

- [ ] **User-data access / export / erasure**
  - define how a user can request access to, export or erase personal data when
    legally applicable;
  - distinguish personal account deletion from shared club-data governance so
    one departing organizer cannot destroy data belonging to the club.

- [ ] **Privacy notice / legal basis**
  - publish a privacy policy describing categories of data, purposes,
    recipients/processors, retention, user rights and contact information;
  - document the legal basis relied upon for each material processing purpose.

- [ ] **Controller / processor responsibilities**
  - document who operates Stripes and acts as controller for account/service
    data;
  - document Firebase/Google and other service providers used as processors or
    subprocessors where applicable;
  - retain the applicable data-processing agreements/terms.

- [ ] **Google integration privacy**
  - before G2/G3 production rollout, audit OAuth scopes and request only the
    permissions required for the chosen functionality;
  - clearly explain My Drive versus Shared Drive permissions to users;
  - Stripes must not silently broaden Google access or move/delete originals.

- [ ] **Administrator security**
  - require strong authentication / 2FA for Firebase / Google Cloud, GitHub,
    Vercel, Resend, Cloudflare and other production-admin services;
  - review active administrator accounts and remove unnecessary permissions;
  - review API keys, secrets and Firebase Secret Manager usage;
  - check the repository, Git history and production logs for accidental
    secrets or sensitive token material.

- [ ] **Security incident procedure**
  - maintain a short written process for investigating suspected unauthorized
    access, containing the incident, preserving relevant evidence and handling
    legally required notifications.

- [ ] **Store disclosure alignment**
  - ensure Google Play Data Safety answers and the public privacy policy match
    the behavior of the production application.

#### Launch rule

A successful build or store submission does **not** by itself satisfy this
gate. Security/privacy readiness requires both technical verification and the
required user-facing/legal documentation.

Any new architecture introduced in G2/G3 must be reviewed against this gate
before being considered complete.

### G2 — Unified Google Connection

**Status:** Current implementation phase. Preflight architecture completed.

G2 builds the reusable Google connection, Cabinet-location and Google-native
permission foundation. It does not build the full Cabinet/resource UX, migrate
Action Board attachments or change Firebase Google identity authentication.

#### G2 preflight findings

- Firebase Google Sign-In is an identity-only `GoogleAuthProvider` path using
  `openid`, `email` and `profile`; it produces the Firebase UID/session and must
  never acquire Drive scopes.
- Google Drive authorization is a separate Google Identity Services browser
  token flow using the least-privilege
  `https://www.googleapis.com/auth/drive.file` scope.
- Drive access tokens are short-lived and memory-only. They disappear on
  refresh and are not stored in Firestore, localStorage, URLs or intentional
  logs; no refresh token is stored.
- The Firebase identity and connected Drive account may differ. Show the
  connected Drive account explicitly and never infer email equality.
- `src/App.tsx` currently owns the raw Drive connection state; G2 must move
  that responsibility incrementally without breaking Cloud Backup.
- the existing backup serializer remains reusable; the legacy Google Sheets
  roster-state path remains compatibility-only and must not become the Cabinet
  foundation.
- current Action Board Firebase attachment/storage behavior remains unchanged
  until G4.

#### Disconnect semantics

**Disconnect Google Drive** means:

- discard the current live access token;
- return Drive connection state to disconnected;
- do not delete Google files;
- do not delete the Stripes workspace;
- do not automatically revoke unrelated Google account access;
- do not unnecessarily erase remembered Cabinet, backup or resource
  references.

Connection state and resource/location state are separate concepts. A future
explicit **Remove Google access** / OAuth-revocation action may be evaluated
separately. Do not conflate disconnect with deletion.

#### Shared Drive scope constraint

Under the `drive.file` least-privilege model, Stripes must not automatically
enumerate all Shared Drives through broader Drive scopes.

Current direction:

- retain `drive.file`;
- use user-driven Google Picker selection where possible;
- inspect selected folder/file metadata;
- detect `driveId` and live capabilities;
- use `supportsAllDrives` and other Shared Drive-aware request parameters where
  required;
- do not require Google Workspace.

If reliable Shared Drive setup cannot be delivered with Picker plus
`drive.file`, stop for explicit OAuth-scope, security and privacy review.
Automatic Shared Drive enumeration is an architectural stop condition unless
separately approved. Never silently broaden OAuth permissions.

#### G2.1 — Unified explicit Google Drive connection

Goal: turn the current Drive authorization into a reusable, explicit
connection layer while preserving Cloud Backup.

Connection state supports:

- disconnected;
- connecting;
- connected;
- expired / reconnect required;
- error.

Track the connected Drive account, granted scope, token expiry and
connection/reconnect status.

Preserve:

- memory-only access token;
- explicit user gesture for authorization;
- complete separation from Firebase Google identity;
- existing Cloud Backup behavior.

G2.1 must not create Cabinet folders, write Cabinet metadata to Firestore,
implement Shared Drive selection or migrate attachments.

First atomic implementation slice:

**G2.1a — Drive connection-state/auth foundation only.**

Implementation checkpoint — 2026-08-18:

- implemented locally with a reusable memory-only Drive connection controller;
- records explicit Drive account, requested/granted scope, expiry, reconnect
  and error state without coupling Drive authorization to Firebase identity;
- Disconnect discards live authorization and uses Google Identity Services
  revocation while preserving Cloud Backup references and Google/Stripes data;
- focused automated tests and the production build pass;
- real Google-account connection, expiry/reconnect and revocation behavior still
  require manual verification before G2.2.

#### G2.2 — Managed My Drive Cabinet location

Establish a dedicated Stripes-managed My Drive folder/location without adding
a Cabinet browser.

Requirements:

- idempotent create-or-rediscover behavior;
- stable folder/file ID and app-specific marker/property;
- survive ordinary rename or move;
- safely handle missing, trashed and duplicate cases;
- avoid an arbitrary whole-Drive scan;
- work with normal personal Google accounts;
- never imply Google Workspace is required.

#### G2.3 — Multi-organizer Google permission foundation

Google permissions remain authoritative. Build the ability to:

- inspect relevant folder/file permissions;
- share using appropriate Google-native roles;
- distinguish Viewer, Commenter and Editor where supported;
- show truthful access state;
- handle permission revocation;
- avoid claiming that every Stripes organizer automatically has Google access.

Do not build a duplicate Stripes file ACL, Treasurer-specific permissions or
automatic permission escalation based on a club title.

Real-account testing is required for folder sharing, collaborator file
creation, ownership/inheritance, permission revocation and organizer turnover.

#### G2.4 — Optional Shared Drive capability

Shared Drive remains optional. Use user-driven Picker selection, `driveId`,
live capabilities and correct Shared Drive-aware API behavior.

Do not require Workspace. Do not use broad automatic `drives.list`
enumeration without an explicit scope/security review.

#### G2.5 — Provider-neutral Cabinet-location metadata

Firestore stores Stripes context/reference metadata only.

Recommended conceptual location:

`sharedGroups/{groupId}/cabinet/config`

Retain standalone shared-roster compatibility if still required.

Suggested fields:

- `schemaVersion`;
- `provider: "google_drive"`;
- `backing: "my_drive" | "shared_drive"`;
- `rootFileId`;
- `driveId | null`;
- `hostOrganizerUid | null`;
- `hostGooglePermissionId | null`;
- `displayName`;
- `createdByUid`;
- `createdAt`;
- `updatedByUid`;
- `updatedAt`.

Do not store:

- access tokens;
- refresh tokens;
- OAuth secrets;
- file bytes;
- unnecessary Google emails;
- copied Google permission lists;
- claims that every organizer has Google access.

Cabinet metadata belongs beneath the workspace so G1.6 closure naturally
removes Stripes-side Cabinet metadata. Closing a Stripes workspace must not
automatically delete external Google files unless a future explicit product
decision approves that behavior.

Any active organizer may eventually change the Cabinet location under normal
equal-organizer governance, with explicit replacement confirmation. No new
secret-ballot system is required for this change, and the previous Google
folder/files must remain untouched.

#### Permanent G2 security regression requirements

- Firebase Google login contains no Drive scopes;
- Drive authorization requests only approved Drive capability scopes;
- tokens never enter Firestore, localStorage, URLs or logs;
- expiry/reconnect behavior is deterministic;
- Drive account identity is displayed independently from Firebase identity;
- Disconnect never deletes Google files;
- Cloud Backup remains functional;
- legacy Google Sheet roster parsing remains functional;
- Action Board Firebase attachments remain unchanged during G2;
- Cabinet metadata cannot be read or written across unrelated workspaces;
- pending invitees and removed organizers cannot access workspace Cabinet
  metadata;
- normal personal Google accounts work without Workspace messaging;
- Shared Drive capability does not silently broaden OAuth scopes.

#### Manual Google production configuration checklist

- Google Drive API enabled;
- Google Picker API configured;
- Google Sheets API retained while legacy Sheets compatibility remains;
- OAuth consent screen branded for Stripes;
- correct privacy, terms and support URLs;
- verified production domain;
- `drive.file` declared;
- OAuth publishing/test-user state appropriate;
- authorized JavaScript origins verified;
- production `VITE_GOOGLE_CLIENT_ID` configured;
- production `VITE_GOOGLE_API_KEY` configured;
- optional `VITE_GOOGLE_APP_ID` documented/verified;
- API-key referrer and API restrictions reviewed;
- Firebase Google provider remains identity-only;
- any future broader Drive scope triggers explicit verification, privacy and
  security review.

#### Current next implementation target

**Current gate: review and real-account verification of the local G2.1a
implementation. Do not begin G2.2 until that gate is approved.**

Scope:

- reusable Drive connection lifecycle;
- connected account identity;
- granted `drive.file` scope;
- expiry and reconnect state;
- safe Disconnect behavior;
- preserve Cloud Backup;
- keep the OAuth token memory-only.

Explicitly excluded:

- Cabinet folder creation;
- Cabinet Firestore metadata;
- Shared Drive setup;
- Cabinet UI;
- attachment migration;
- club-role UI implementation unless separately scheduled.

The flexible club-role architecture is recorded, but its UI is not part of
G2.1a.

### G3 — Google Resource + Club Cabinet Foundation

Implement only after G2 connection/location/permission foundations are
verified. G3 builds the actual user-facing Club Cabinet/resource experience.

Initial goals:

- individual Google resource references;
- one provider-neutral Stripes resource/Cabinet metadata model;
- managed My Drive Cabinet as the universal Google-backed mode;
- optional eligible Shared Drive Cabinet as the organization-owned mode;
- one Cabinet UI regardless of backing mode;
- managed real-folder behavior for the active Google Cabinet location;
- Action Board contextual attachment;
- Firestore metadata/context relationships;
- clear unavailable/permission/reconnect states;
- explicit storage-mode/continuity information during Cabinet setup;
- no requirement that users purchase Google Workspace.

Core boundary:

**Google owns the file; Stripes owns the club context and organization.**

Potential G3 resource context may include title, Google type/source, club
category, who added it, an optional club-role label, truthful Google
access/status, an Open in Google action and origin/context such as Action Board
or Equipment where relevant later.

Do not implement this full Cabinet UX during G2. Existing Firebase-hosted
Action Board attachments remain until the later G4 migration/retirement phase.

Each G phase must remain atomic and independently revertible according to
AGENTS.md.

## 2026-08-18 Implementation Strategy — Codex-first, architecture-first

**Status:** AUTHORITATIVE CURRENT EXECUTION STRATEGY.

This section governs implementation order and engineering workflow from the
2026-08-18 checkpoint onward.

Where older roadmap checkpoint text says a phase is still “in progress,” that
historical wording records the state at that earlier date. **Current Phase
Status, later release checkpoints and this dated implementation strategy
govern current execution.**

### Engineering operating model

Stripes is now interconnected enough that most remaining structural repo-level
implementation should be performed with Codex rather than through ad-hoc
manual changes.

Core workflow:

**design/decide → define dependencies/order → tightly scoped implementation →
build/test → inspect diff → commit → deploy where appropriate → verify on
phone → continue**

Rules:

- resolve product and architecture decisions before asking Codex to code;
- use Codex for repo-aware implementation, dependency tracing, refactoring,
  tests and architectural work;
- do not use Codex for open-ended product brainstorming;
- prefer small atomic, reversible, extensible changes;
- every substantial patch must remain independently reviewable/revertible;
- stop at genuine phase boundaries or unresolved product/architecture
  decisions;
- do not implement a temporary architecture when a known upcoming dependency
  would require substantial rework;
- treat Codex allowance as an engineering resource: additional planning is
  worthwhile when it avoids unnecessary implementation/refactoring cycles.

### Full Codex vs Spark vs direct patch

Use **Full Codex** when repo-wide awareness or deeper reasoning materially
reduces risk, including:

- authentication/security;
- Firebase rules/Functions;
- Google OAuth / Drive lifecycle;
- permissions;
- persistence/schema work;
- migrations/backward compatibility;
- cross-cutting refactors;
- structured evaluator / Best Completion Engine;
- Generate replacement;
- Live Split engine integration.

Use **Codex Spark** for well-specified lower-risk execution where the solution
is already decided, including:

- focused regression tests with known expected behavior;
- mechanical type/interface propagation;
- bounded component extraction;
- straightforward follow-up implementation;
- small isolated code changes that still benefit from repo awareness.

Use **direct patch / local iteration** when repo-wide analysis adds little
value, including:

- isolated CSS/layout/copy changes;
- rapid visual prototypes;
- small UI polish after architecture is settled;
- documentation-only edits.

Do not choose Spark merely because it is cheaper if a task has hidden
architecture/security consequences.

### Authoritative remaining implementation sequence

G2.1a is implemented locally. The current gate is review and real-account
verification; G2.2 is the next atomic implementation target only after that
gate is approved.

Complete the G-track in order before building the full Cabinet UI:

1. **G2.1a — Drive connection-state/auth foundation** — Full Codex.
   - reusable Drive connection lifecycle;
   - explicit connected Google account;
   - requested/granted scope state;
   - expiry;
   - reconnect;
   - true disconnect/revoke semantics;
   - memory-only Drive token;
   - Firebase Google identity remains separate;
   - preserve existing Cloud Backup;
   - no Cabinet folder, Firestore Cabinet metadata or Shared Drive behavior.

2. **G2.2 — Managed My Drive Cabinet location** — Full Codex.
   - idempotent create/find;
   - stable marker/ID;
   - renamed/moved/trashed/duplicate handling;
   - compatible Drive API parameters for future Shared Drive work.

3. **G2.3 — Multi-organizer Google permission foundation** — Full Codex.
   - Google permissions remain authoritative;
   - do not duplicate Google ACLs in Stripes;
   - real multi-account testing required.

4. **G2.4 — Optional Shared Drive capability** — Full Codex.
   - remain within approved narrow scope/Picker architecture;
   - if `drive.file` cannot truthfully support the promised behavior, STOP for
     architecture review;
   - never silently broaden OAuth scope.

5. **G2.5 — Provider-neutral Cabinet-location metadata** — Full Codex.
   - Firestore records Stripes location/context metadata only;
   - no credentials/tokens;
   - Google remains authoritative for the actual file/folder.

Then complete a **minimal G3 Google Resource + Cabinet foundation** while the
Google architecture is still loaded in engineering context:

- provider-neutral resource references;
- minimal Cabinet root/index;
- contextual Action Board / Equipment resource relationships;
- unavailable / permission / reconnect states;
- removing a Stripes relationship must not silently delete the Google file;
- do not recreate Firebase general document hosting;
- stop before broad Cabinet polish/folder UX if it is not required by the
  foundation.

After the G-track foundation is stable, proceed through T1 in this order:

6. **T1.0 — Current-generator regression/scenario foundation** — Spark is
   preferred if the scope remains test-only and behavior is already specified.

7. **T1.1 — Versioned SportDefinition + Basic/Detailed profile schema** — Full
   Codex.
   - backward compatible;
   - no silent legacy reinterpretation;
   - no generator replacement yet.

8. **T1.2 — Detailed Profile persistence/compatibility** — Full Codex.
   - establish the data-truth model before visual UX;
   - preserve legacy roster behavior.

9. **T1.3 — Detailed Profile six-row / one-swipe prototype** — Spark or direct
   patch.
   - optimize for rapid real-phone iteration;
   - validate gesture, snap behavior, scrolling and finger visibility before
     locking details.

10. **T1.4 — Card/radar / Playing Profile integration** — Spark initially once
    persistence is stable.

11. **T1.5 — Structured evaluator** — Full Codex.
    - score arbitrary teams before replacing Generate;
    - machine-readable Overall/composition/constraint metrics.

12. **T1.6 — Balance Priorities** — Full Codex for evaluator integration;
    Spark/direct patch for simple UI follow-up.
    - replaces future Field Size weighting semantics;
    - Overall fairness remains the primary guardrail.

13. **T1.7 — Best Completion Engine / Generate v2** — Full Codex.
    - compare against legacy generator using regression/scenario tests;
    - do not replace production behavior until verified.

14. **T1.8 — Live Split** — Full Codex for engine integration; Spark/direct
    patch for UI iteration.
    - same Best Completion/evaluator foundation;
    - manual assignments become locks;
    - future-aware suggestions;
    - Undo;
    - late/no-show minimal correction.

15. **T1.9 — AI team controls and explanations.**
    - only after the deterministic evaluator exists;
    - natural language → visible structured interpretation → deterministic
      action → grounded explanation;
    - AI must not invent sport attributes or bypass the evaluator.

### Club Activity sequence

Do not implement Club Activity merely because legacy Club Notes exists.

First stabilize the relevant source systems:

- Action Board;
- Equipment;
- Attendance/conduct;
- organizer membership/governance;
- Cabinet/resource metadata.

Then explicitly design:

- event categories;
- meaningful-change thresholds;
- suppression/compression;
- ranking/importance;
- current state vs historical result;
- drill-down history;
- resolved/old activity behavior;
- relationship with notifications.

After deterministic Club Activity is useful, a paid AI Club Brief may be added
as a convenience layer.

### Meetup

Meetup remains waiting on API access.

When access is granted:

- verify live API capabilities/scopes first;
- implement the approved read-only RSVP workflow;
- keep Meetup import Free;
- connect Meetup/Today participant state cleanly into Generate and Live Split;
- Meetup approval must not block store launch.

### Explicitly postponed

Do not spend current structural implementation capacity on:

- expanding legacy Club Notes;
- AI Club Brief before deterministic Club Activity;
- Quick Teams before structural launch work unless used as a deliberately
  isolated acquisition/polish task;
- Google Calendar;
- Notion OAuth/integration;
- Dropbox/OneDrive-specific integrations;
- broad Google Drive scopes;
- native Stripes general document hosting;
- complex Custom Sport weighting/configuration;
- final Playing Profile vocabulary before real profile testing;
- general chat;
- accounting/expense-management expansion inside Equipment;
- major Team Generator ↔ Club navigation restructuring while that product
  concept remains exploratory.

### Launch-ready versus post-launch

Do not make every approved future feature a blocker for the
2026-09-30 Google Play launch.

Launch-critical concerns include:

- security/governance remains stable;
- authentication remains reliable;
- no destructive migration/data-loss behavior;
- current core Roster / Today / Teams workflow remains reliable;
- exposed Google functionality is truthful and safe;
- production/mobile regression checks pass;
- required legal/store readiness is complete.

The following may ship after the first store release if necessary:

- full Generate v2;
- Live Split;
- full Club Activity;
- AI Club Brief;
- Quick Teams;
- broad/polished Cabinet expansion.

Do not rush architectural work merely to include every approved future feature
in the first store build.

### T1 — Multi-Sport Team Generation Architecture

**Status:** APPROVED ARCHITECTURE / DOCUMENTATION ONLY — NOT IMPLEMENTED.

Team generation remains a core Stripes differentiator. T1 defines a generic,
versioned multi-sport foundation without casually rewriting current Football
behavior or weakening deterministic fairness.

The product goal remains generating fair teams quickly without exposing
mathematical complexity to recreational organizers.

T1 is an independent product track that may be worked while G2 is paused. It
does not replace or reorder the locked Google/Cabinet roadmap: G2 remains the
next Google/Cabinet implementation phase when that work resumes. This section
does not alter any completed G1 decision or any approved G2 architecture.

#### Core architecture

The target architecture consists of:

- one generic team-balancing engine;
- one versioned **Sport Definition** per roster;
- Football as the first versioned built-in Sport Definition and regression
  baseline;
- future built-in Sport Definitions such as Volleyball and Basketball;
- a **Custom Sport / Game** definition for organizer-defined activities;
- either three triangle attributes or six hexagon attributes per definition;
- zero or one optional **Special Ability** outside the attribute geometry;
- temporary **Balance Priorities** chosen for the current Today/generation
  session;
- sport policies for field size, team-size format and other sport-specific
  balancing behavior;
- structured, machine-readable team evaluation that can power tests,
  comparisons, swaps, explanations and later grounded AI assistance.

The generic engine must operate on generic concepts such as attribute IDs,
ratings, priorities, constraints, ability coverage and sport policies. It must
not contain hard-coded Football labels such as Attack, Defense or Goalkeeper.

Built-in Sport Definitions may supply carefully tested defaults and
sport-specific policy behavior. Custom definitions use transparent generic
behavior rather than pretending Stripes knows sport-specific strategy it has
not been taught.

#### Versioned Sport Definition per roster

Every roster has one versioned Sport Definition. Its source is either:

- `built_in`, using a Stripes-owned versioned definition; or
- `custom`, using an organizer-created definition stored with that roster.

A Sport Definition establishes at least:

- stable sport/definition identity;
- source and schema version;
- display name;
- three-attribute triangle or six-attribute hexagon profile shape;
- stable attribute IDs;
- attribute labels, meanings, help definitions and display order;
- zero or one optional Special Ability definition;
- applicable sport policies and supported Balance Priority options.

A Stripes-maintained built-in definition may contain its Overall Skill model,
three/six balance attributes, optional Special Ability, default balance
behavior, sport-specific evaluation, team-size policy, field/court condition
policy and other validated sport-specific rules.

During Custom Sport / Game roster creation, the organizer defines the
sport/game name, chooses three triangle attributes or six hexagon attributes,
names those attributes and may optionally define one Special Ability. The
organizer may skip Special Ability completely. Custom definitions must work
with generic team balancing without requiring custom algorithm code.

The roster's definition is the contract used by player profiles, radar
visualization, team generation, evaluation, priorities and explanations.

#### Immutable roster schema

After roster creation, the following Sport Definition semantics are immutable
for that roster:

- sport identity, source and version;
- three-versus-six attribute shape;
- stable attribute IDs;
- each attribute's meaning and order;
- the optional Special Ability's stable identity and meaning.

Existing player data must never be silently reinterpreted under a new meaning.
A future schema change requires an explicit migration flow or roster
duplication into a newer definition. Existing rosters remain pinned to their
recorded version until the organizer deliberately migrates them.

Whether a custom definition may later receive cosmetic-only display-label
renames without changing its immutable semantic contract remains an explicit
open decision. Cosmetic changes must never mutate stable IDs or meanings.

#### Player profile model

Each player's membership in a roster keeps separate concepts:

- **Overall Skill** — the organizer's general assessment of that player in the
  roster's sport/context;
- **Attribute ratings** — three or six ratings whose IDs come from the active
  Sport Definition;
- **Special Ability** — optional rating/state only when the definition enables
  one.

Overall Skill and advanced attributes are related inputs, but their exact
mathematical relationship remains open. T1 must not assume one universal
Player Index that collapses every sport and every definition into a single
formula.

The same real person may have independent profiles in different sport-specific
rosters. Ratings belong to the player's roster membership, not to a universal
cross-sport identity.

#### Radar visualization and advanced ratings

The advanced-rating radar uses the actual active Sport Definition:

- three attributes render as a triangle;
- six attributes render as a hexagon;
- labels and help copy come from the definition;
- the same stable attribute IDs power the optimizer, Balance Priorities,
  structured evaluation and explanations.

The radar must not be a decorative layer disconnected from team generation.
Changing a displayed axis or its semantics is therefore a schema/versioning
decision, not a typography-only rename.

#### Football definitions

The current Football six-axis order clockwise from 12 o'clock is:

- Attack;
- Passing;
- Stamina;
- Defense;
- Strength / Physical;
- Speed.

A proposed **Football v2** profile is:

- Attack;
- Passing;
- Stamina;
- Defense;
- Technique;
- Pace.

`Physical` to `Technique` is a semantic change and must never reinterpret an
existing Physical rating as Technique. `Speed` to `Pace` may be terminology
compatible, but stable-ID compatibility must be audited rather than assumed.
T1 must inspect the current stored model, default values, UI and optimizer
usage before defining any v1-to-v2 migration.

Football remains the initial regression baseline. New Football rosters may use
the latest approved built-in version once implemented, while existing rosters
stay pinned to their recorded version until explicit migration.

#### Optional Special Ability

A Sport Definition may declare zero or one Special Ability. It is deliberately
outside the triangle/hexagon attribute geometry because it represents a
distinct coverage or role concern rather than another general axis.

For Football, the proposed Special Ability is **Goalkeeper**. Whether its first
representation is boolean, a small ordinal scale or another compact model is
still open and must be resolved before implementation.

A Custom Sport / Game may also define zero or one Special Ability with a
stable ID and immutable meaning. Its creation UI must explain the distinction
with this copy:

> Special ability — optional. Is there one role or ability Stripes should pay
> special attention to when forming teams? Examples: Goalkeeper, Setter,
> Healer, Pitcher. Skip if your sport/game does not need one.

If skipped, no Special Ability data or control exists for that roster. Future
Volleyball and Basketball Special Abilities remain TBD and must be designed
sport-by-sport rather than guessed now.

Special Ability balancing uses distinct internal semantics from ordinary
attribute weighting. It must not be disguised as a seventh radar axis.

#### Balance Priorities

Balance Priorities are temporary choices for the current Today/team-generation
session. They are not permanent changes to player ratings or the roster's
Sport Definition.

Requirements:

- derive available priorities dynamically from the active Sport Definition;
- allow zero, one or multiple priorities;
- do not expose raw optimizer-weight sliders;
- treat an attribute priority as a modifier to normal fairness, not a
  replacement for overall team balance;
- treat Special Ability priority as a distinct coverage/role policy rather
  than an ordinary attribute multiplier;
- make the active priorities visible in structured evaluation and future
  explanations;
- clear or deliberately re-establish session priorities according to the
  Today/session lifecycle rather than silently making them roster defaults.

For example, Football v2 may show a **Player attributes** section containing
Attack, Passing, Stamina, Defense, Technique and Pace, followed by a
**Special ability** section containing Goalkeeper. The Special Ability section
appears only when the active definition supplies one.

Selecting Defense does not create more defensive ability. It tells the
optimizer to distribute the available defensive ability more evenly while
preserving acceptable overall fairness. Selecting Goalkeeper may instead
increase the importance of goalkeeper coverage/quality distribution rather
than merely equalizing a numerical average; the active Sport Definition owns
that interpretation.

The exact multiplier, trade-off limits and many-priority UX remain unresolved.

#### Generic optimizer and evaluation contract

The optimizer receives a sport-neutral input contract containing:

- players and their Overall Skill;
- definition-addressed advanced attribute ratings;
- optional Special Ability values;
- temporary Balance Priorities;
- team count and team-size policy;
- existing together/apart locks and other explicit constraints;
- applicable built-in or generic sport policies;
- history/variation inputs when that feature is deliberately enabled.

The optimizer must produce a structured evaluation rather than only rendered
teams. The machine-readable result should be able to describe:

- overall fairness;
- per-attribute team totals/averages and imbalance;
- priority-specific outcomes;
- Special Ability coverage;
- team-size/headcount effects;
- satisfied or unsatisfied constraints;
- candidate swap effects;
- the grounded facts used by **Why these teams?** explanations.

This evaluation contract is the foundation for deterministic regression tests,
team comparisons, constrained swaps and later AI explanations. UI prose must
be derived from evaluated facts rather than invented independently.

#### Missing advanced data

Stripes must not fabricate missing advanced attribute values from Overall
Skill merely to fill the radar or satisfy the optimizer contract.

T1 must explicitly decide:

- the coverage threshold at which advanced evaluation becomes useful;
- how partially rated players affect attribute balance;
- whether an attribute can be prioritized when data coverage is incomplete;
- how uncertainty is represented in evaluation and explanations;
- what fallback uses Overall Skill without falsely claiming advanced insight.

Until those rules are approved, missing data remains missing data.

#### Sport-specific policy layering

For Football, team generation should apply inputs in an explicit, testable
order:

player ratings
→ Football defaults
→ field-size modifier
→ temporary Today Balance Priorities
→ deterministic optimizer and structured evaluation

The exact mathematical combination remains part of T1 design and testing.
This layering records responsibilities; it does not pre-approve multipliers.

##### Field size

T1.1 must audit how the current field-size control affects generation today.
Do not preserve or replace behavior based on assumptions.

For Football v2, the following are hypotheses to test against real matches,
not locked formulas:

- Small field may increase the relevance of Technique and Passing;
- Medium field may remain neutral;
- Large field may increase the relevance of Pace and Stamina.

Custom Sport / Game definitions use generic behavior unless a policy is
explicitly authored and validated. Stripes must not silently apply Football
field assumptions to another sport.

##### Uneven team sizes and substitutes

Uneven-player behavior belongs behind a `teamSizePolicy` rather than scattered
special cases.

A real nine-player futsal match demonstrated that permanent 4-vs-5 play differs
from a five-player roster rotating substitutes while equal numbers are active:

- **No substitutes / unequal active team sizes:** the smaller team may require
  stronger players to balance effective match strength;
- **Rotating substitutes / equal active team sizes:** use normal balance and
  do not apply artificial headcount compensation.

When attendance cannot divide evenly, a small contextual question such as
**Will you rotate substitutes?** is preferable to a permanent settings panel.
The compensation mathematics remain unresolved and must be tested with real
match scenarios.

#### Built-in versus Custom Sport / Game behavior

Built-in definitions are versioned Stripes products. They may provide tested
sport-specific defaults, policy modifiers, Special Ability behavior and
explanation vocabulary.

Custom Sport / Game definitions provide:

- a name;
- either three or six organizer-defined attributes;
- stable IDs, labels, meanings and order;
- zero or one optional Special Ability;
- generic optimizer/evaluation behavior;
- temporary priorities derived from those custom attributes and ability.

Custom definitions must not receive invented sport expertise. The initial
generic balancing model, especially Special Ability evaluation, remains an
explicit design task.

Once implemented, a valid Custom Sport / Game should automatically receive its
radar, generic attribute balancing, dynamic Balance Priorities, optional
Special Ability handling and structured evaluation without bespoke optimizer
code.

#### Versioning and compatibility

Built-in Sport Definitions are immutable versioned contracts:

- new rosters may default to the latest approved version;
- existing rosters remain pinned to their stored version;
- a display-label change is not automatically a data migration;
- semantic changes require a new definition version;
- migration must show what will change and must be explicit;
- where safe migration cannot be proven, duplicate the roster into the new
  definition instead of rewriting the old profile data;
- historical sessions and explanations must remain interpretable against the
  definition version that produced them.

#### Future natural-language and AI boundary

Organizers may later request changes such as:

- "Make a different variation from last week.";
- "Put Vivian and Paul on the same team.";
- "Keep these two players apart.";
- "Make sure every team has at least one runner.";
- "Spread the good defenders across the teams.";
- "Blue looks too weak defensively.".

AI must not independently invent teams or reference attributes that do not
exist in the active Sport Definition.

Approved future flow:

natural-language/voice request
→ AI receives the active versioned Sport Definition
→ AI returns only valid structured constraints/preferences
→ Stripes shows the structured interpretation to the organizer
→ deterministic optimizer generates or adjusts teams
→ structured evaluation grounds the explanation

Post-generation assistance should propose constrained, evaluated swaps and
explain their effect. AI implementation belongs after the deterministic T1
foundation and is not part of the initial T1 sequence.

#### Atomic implementation sequence

T1 must proceed in small, independently reviewable steps:

1. **T1.1 — Current implementation and data audit**
   - map current player fields, six attributes, Overall Skill formula, radar,
     Goalkeeper representation, field-size logic, team-size logic, pairing
     constraints, optimizer/evaluation, persistence, hard-coded Football
     assumptions, existing tests, history and missing-data behavior;
   - collect representative real-match regression cases, including permanent
     4-vs-5 and rotating-substitute scenarios;
   - do not change behavior.
2. **T1.2 — Versioned Sport Definition contract**
   - define built-in/custom schemas, stable IDs, immutability, three/six
     profile shape and optional Special Ability contract;
   - define compatibility and validation tests before persistence migration.
3. **T1.3 — Player profile contract**
   - separate Overall Skill, definition-addressed attributes and optional
     Special Ability while preserving existing Football data.
4. **T1.4 — Generic structured evaluation**
   - create sport-neutral evaluation output and regression fixtures around the
     existing deterministic generator before changing optimization behavior.
5. **T1.5 — Temporary Balance Priorities**
   - add definition-derived session priorities with no raw sliders and no
     silent persistence as player/roster ratings.
6. **T1.6 — Football v2 definition**
   - resolve Technique/Pace semantics, Goalkeeper representation, defaults,
     field modifiers and explicit v1 compatibility/migration UX.
7. **T1.7 — Custom Sport / Game creation**
   - create immutable three- or six-attribute definitions with zero/one
     Special Ability and clear help copy.
8. **T1.8 — Generic custom-sport balancing**
   - apply transparent generic evaluation/optimization without invented sport
     strategy.
9. **T1.9 — Sport and team-size policies**
   - implement tested field/format policies, including no-sub versus rotating
     uneven-team behavior.
10. **T1.10 — Grounded explanations and swaps**
    - derive **Why these teams?**, comparisons and constrained swap effects
      from structured evaluation.

Natural-language/voice interpretation and AI assistance remain later work
after T1.1–T1.10 establish the deterministic contracts and regression gates.

#### T1 Live Split — Human-Assisted Team Formation

**Status:** HIGH-VALUE PRODUCT DIRECTION / MAJOR T1 FEATURE. Further UX and
algorithm refinement is required before implementation.

Live Split addresses a real weakness of pre-generated recreational teams:
attendance is often uncertain at the exact moment teams need to be formed.
It may become a core/game-changing T1 feature, but its product direction is
approved while its final implementation scope is not.

##### Real-world problem

A Meetup event may show 19 expected players while, on the field:

- some people do not arrive;
- some are late;
- the organizer does not immediately know who is missing;
- people continue arriving while teams are being formed.

An experienced organizer may reasonably prefer to split teams manually on
site rather than first clean up attendance and repeatedly regenerate complete
teams. Stripes should support that reality directly.

##### Generate Teams and Live Split have different jobs

Preserve two complementary serious team-formation modes.

**Generate Teams** is best when the actual participant set is reasonably
settled. For example, 19 players are expected and the organizer confirms all
19 are present, or quickly removes the known absences and confirms 16. Once
Stripes knows the participating set, Generate creates the complete team
arrangement.

**Live Split** is best when attendance is uncertain, incomplete, still
changing, being resolved physically on site, or the organizer simply prefers
manual formation. The Meetup/Today list becomes the candidate pool. The
organizer taps players as they physically see them and progressively assigns
them into teams.

Assignment effectively confirms that player as present. Untapped expected
players remain unassigned, possibly absent or potentially late. Live Split can
therefore resolve actual attendance through the act of forming teams.

The UI may recommend:

- **Attendance settled → Generate**;
- **Attendance uncertain → Live Split**.

The organizer remains free to choose either mode. Never hard-code a rule such
as **missing player = Live Split required**: an organizer may know exactly who
is absent and still prefer automatic generation.

##### Shared deterministic intelligence

Generate and Live Split use the same deterministic T1 evaluation foundation:

```text
Expected / actual players
          ↓
Sport Definition
          ↓
Team evaluation / Best Completion Engine
          ↓
┌─────────────────────────┐
│                         │
Generate Teams        Live Split
│                         │
Stripes chooses       Organizer chooses
complete teams        progressively
│                         │
└────────────┬────────────┘
             ↓
      Same fairness model
```

Do not build a separate simplistic fairness algorithm for Live Split.

##### Best Completion Engine

The **Best Completion Engine** is an important T1 architectural concept. Given:

- attending/candidate players;
- teams already partially built;
- unassigned players;
- locked manual assignments;
- the active Sport Definition;
- Overall Skill;
- sport attributes;
- temporary Balance Priorities;
- optional Special Ability;
- gender-balancing requirements where applicable;
- team-size policy;
- field/court conditions;

the engine answers:

**What is the best fair completion still possible from the current state?**

Conceptually:

```text
partially assigned teams
+ remaining players
+ sport/session rules
          ↓
Best Completion Engine
          ↓
best achievable completion
+ team evaluation
+ suggested next assignments
+ minimal corrections if necessary
```

This capability is broader than Live Split. It may later support automatic
Generate, late arrivals, no-show correction, post-generation swaps,
**Blue is weak defensively** adjustments, **Why These Teams?** and future AI
instructions.

##### Globally future-aware recommendations

Live Split recommendations must not be greedy. The engine must not ask only:

**Who best matches the next player or team right now?**

It must ask:

**Which assignment helps the current team while preserving the ability to form
fair teams from everyone remaining?**

For example, with 30 players forming 15 pairs, consuming all medium-strength
players in the first ten locally plausible pairs may leave five badly
mismatched pairs. Recommendation quality should combine:

- quality of the current assignment;
- fairness of teams already formed;
- best achievable fairness of the remaining teams.

Suggestions consider the entire unassigned pool. Future-completion feasibility
becomes increasingly important as that pool shrinks.

This global/future-aware behavior is required for pairs, two teams, three
teams, four or more teams, all supported built-in sports and Custom Sport/Game
where applicable.

##### Continuous tap and active-color loop

Preserve the strongest current UX direction: one tap assigns one selected
player to the currently active team color, then the active team advances
automatically.

Four-team example:

```text
NEXT → BLUE    tap Anna
NEXT → RED     tap Maria
NEXT → GREEN   tap Lisa
NEXT → YELLOW  tap Sarah
NEXT → BLUE
```

The ordinary path should require approximately **N players → N assignment
taps**. Avoid requiring **tap player → choose destination team** for every
normal assignment.

If a team reaches its target capacity, the active-color loop skips that team
where appropriate. Do not hard-code equal team sizes. Respect the future
`SportDefinition.teamSizePolicy`, including unequal-team cases.

##### Round anchor and simultaneous suggestions

The color loop naturally creates implicit distribution rounds, although the UI
does not need to expose the word **round**.

The first player manually selected in a new loop becomes its temporary anchor.
For four teams, if Blue is active and the organizer selects
**Anna · female · Skill 4**, Anna becomes the anchor. Stripes then calculates
useful counterparts for Red, Green and Yellow.

Where useful, show one simultaneous suggested player for each remaining team:

```text
BLUE          RED          GREEN        YELLOW
Anna          Maria        Lisa         Sarah
anchor        suggested    suggested    suggested
```

For three teams, show the anchor plus up to two suggestions. Suggestions should
preferably appear as subtle team-color highlighting directly in the unassigned
player interface rather than as repeated modal confirmations. Exact visual
design remains open.

##### Recommendation inputs, not anchor cloning

Do not reduce recommendation logic to **find players most similar to the
anchor**. Anchor similarity is useful, but it is only one input.

Recommendations should consider:

- approximate similarity to the current anchor;
- Overall Skill;
- current destination-team strength;
- all already-built teams;
- sport attributes;
- today's Balance Priorities;
- optional Special Ability;
- gender distribution where applicable;
- team capacity;
- the entire remaining unassigned-player pool;
- best achievable eventual team fairness.

A mathematically closer clone of the anchor may be a worse recommendation when
using that player now makes the remaining teams substantially harder to
balance.

If Anna is a female Skill 4 anchor and the session is distributing gender,
Stripes may strongly prefer comparable female players for the other teams. Do
not hard-code **female anchor → female player mandatory**. Gender is relevant
only when data exists, the roster/session uses it and the balancing policy
considers it relevant. Live Split must also work when gender is not tracked.

##### Organizer authority and continuous recalculation

Preserve the central principle:

**Organizer defines reality; algorithm continuously adapts.**

Suggestions are advisory. If Stripes suggests **Maria → Red** and the organizer
taps Peter instead:

- Peter is assigned immediately;
- that manual choice becomes locked reality;
- remaining recommendations recalculate immediately.

Never block an organizer because the algorithm prefers another player.

After every tap:

1. lock the organizer's decision;
2. reevaluate all current teams;
3. reevaluate the remaining pool;
4. recalculate the best achievable completion;
5. update remaining suggestions.

The UI must feel immediate. Live Split fails if smart recommendations visibly
take several seconds after each tap. Responsiveness is a hard implementation
requirement. The exact optimization/search technique remains a later
engineering decision; do not assume brute-force enumeration.

##### Avoiding an unfair final corner

One of Live Split's main benefits is preventing the common manual-split failure
where the first teams look reasonable but the remaining players cannot be
distributed fairly.

Most future-completion intelligence should remain invisible. Do not show
constant mathematical warnings. If manual choices materially reduce the
possibility of a fair result, Stripes may show simple feedback such as:

**Remaining players are becoming harder to balance.**

and offer a useful recommendation. Near the final rounds, recommendations may
become more visually assertive because fewer fair completions remain, but they
remain optional.

##### Undo and live team evaluation

Maintain a prominent Undo control. Undo restores:

- the previous assignment;
- the previous active team/color;
- round/anchor state;
- recommendation state.

Repeated undo should be supported where practical.

After every tap, the shared engine evaluates the current team state. Keep
user-facing feedback visual and simple. Potential meanings include:

- teams currently close;
- Blue noticeably stronger;
- Green needs defensive help;
- Special Ability distribution uneven.

Do not require the organizer to interpret raw optimizer scores. Exact
visualization remains a UX design problem.

##### Late arrivals and no-shows

Live Split must support a player arriving after teams already exist. For
example, 19 players were expected, 16 have been assigned and Jorge arrives
late. The organizer marks/selects Jorge as present. The Best Completion /
evaluation engine may recommend **Best fit: Green**. The organizer may accept
or ignore it.

Do not automatically regenerate existing teams. If the late arrival creates a
meaningful imbalance, suggest the smallest useful correction, for example:

```text
Jorge → Green
Suggested adjustment: Marco ↔ Peter
```

Untapped expected Meetup players may remain unassigned without explicit
cleanup before Live Split begins. If an already-assigned player turns out not
to be playing:

- remove or mark that player absent;
- preserve other existing assignments;
- reevaluate;
- recommend the smallest useful correction.

Complete regeneration is not the default.

##### Attendance-through-assignment workflow

Live Split can collapse:

```text
confirm attendance
        ↓
configure teams
        ↓
form teams
```

into:

```text
expected player pool
        ↓
tap the people who are actually here
        ↓
teams emerge
```

This continuous attendance/team-formation workflow is one of Live Split's
strongest product benefits because it reduces on-field administrative work.

##### Shared T1 integrations

Live Split consumes the same temporary Balance Priorities as automatic
Generate. For example, when Football Defense is prioritized, suggestions
consider defensive distribution more strongly while preserving Overall Skill
fairness and future-completion quality. Do not create a separate Live Split
weighting model.

Live Split also consumes the active Sport Definition's optional Special
Ability. For Football, Goalkeeper distribution may influence suggestions when
relevant. Do not implement a Live Split-specific goalkeeper model.

The generic Live Split architecture eventually consumes:

- Sport Definition;
- player sport profiles;
- Overall Skill;
- balance attributes;
- optional Special Ability;
- Balance Priorities;
- team-size policies;
- field/court conditions.

Volleyball, Basketball and Custom Sport/Game should reuse the same interaction
and recommendation architecture. Do not hard-code Football assumptions into
the generic Best Completion or Live Split engine.

##### Relationship to Quick Teams

Keep this boundary explicit:

**Quick Teams**

- one-off;
- names only;
- random;
- playful;
- no roster intelligence.

**Live Split**

- a serious Stripes Team Generator feature;
- uses roster/current attendance;
- uses player ratings and sport intelligence;
- uses future-aware optimization;
- keeps assignments under human control;
- is designed for uncertain real-world attendance.

Do not merge the two features.

##### UX and algorithm questions still unresolved

Do not implement before refining and prototyping:

- mobile one-screen layout;
- active-color visibility;
- representation of two, three, four or more teams;
- 20–30+ player pools;
- anchor/suggestion presentation;
- simultaneous suggestions;
- balance feedback;
- team-full behavior;
- manual team correction;
- Undo;
- late arrival;
- no-show removal;
- scrolling while preserving visible active-team context;
- one-handed outdoor use;
- sunlight/readability;
- accessibility for people who cannot distinguish team colors;
- whether team-first assistance adds value or should be omitted;
- the optimization/search approach and performance bounds needed for
  immediate recalculation;
- how Best Completion recommendations trade local round quality against final
  global fairness.

Do not ask Codex to invent the final Live Split interface from a vague
specification. Continue UX and algorithm refinement, prototype the interaction
states and performance assumptions, and only then assign a bounded
implementation sequence.

Live Split is approved as a potentially core/game-changing T1 direction, not
as an implementation-ready feature. It does not alter the current T1.1–T1.10
sequence until its UX and algorithm decisions are sufficiently refined to
place it safely.

#### Explicit unresolved questions

The following decisions remain open and must not be silently answered during
implementation:

- Overall Skill versus detailed-attribute mathematical relationship;
- Generic team-attribute aggregation formula;
- Balance Priority multiplier;
- Maximum acceptable Overall Skill trade-off;
- Missing-rating behavior;
- Special Ability / Goalkeeper value scale;
- Generic Custom Sport / Game Special Ability evaluation;
- Football v2 default weights;
- Small / Medium / Large field modifiers;
- Uneven-team compensation formula;
- Football v1-to-v2 migration UX;
- Whether Pace permanently retains the legacy Speed identity internally;
- Exact Football attribute help/rating definitions;
- Custom attribute cosmetic-renaming policy;
- UX behavior when many Balance Priorities are selected.

Do not begin T1 implementation from this architecture record alone. Start with
the bounded T1.1 audit, resolve its factual findings and regression cases, then
seek approval for each behavioral contract that remains open.

#### 2026-08-17 locked T1 refinement — Player Profiles, Balance Priorities and Detailed Profile UX

**Status:** APPROVED DESIGN DIRECTION / DOCUMENTATION ONLY — NOT IMPLEMENTED.

Detailed implementation/UX reference:

`docs/design/T1_PLAYER_PROFILE_TEAMING_SPEC_2026-08-17.md`

This dated refinement records the current authoritative T1 direction. Where
older T1 wording conflicts with this subsection, **this 2026-08-17 refinement
takes precedence**.

In particular, this refinement supersedes older assumptions that:

- Detailed attributes must determine Overall Skill;
- Field Size should remain a normal team-generation control;
- the generic multi-sport engine requires a field/court-size concept;
- the future categorical player concept should be called Special Ability;
- the current Team Play multiplier or large algorithmic trait pile should
  remain part of the future generic core.

##### Overall Skill and attribute meaning

**Overall Skill is the required primary strength anchor.**

Overall answers:

> How good is this player?

Detailed sport attributes answer:

> How is this player good?

Overall remains organizer-authored and is the dominant fairness input for team
formation.

Detailed attributes describe the player's ability shape and team-composition
characteristics. They must not secretly become a second competing Overall
rating.

Example:

- Marco — Overall 7
- Attack 9
- Passing 8
- Stamina 7
- Defense 6
- Technique 9
- Pace 8

The intended interpretation is that Marco remains fundamentally an Overall-7
player but has particular strengths and weaknesses relative to players around
that level.

Changing an attribute must **not silently recalculate Overall**.

Changing Overall later must **not silently move reviewed attribute values**.

If Overall and a Detailed profile become extremely contradictory, Stripes may
offer a rare, non-blocking suggestion to review Overall. It must never silently
rewrite user data.

Overall fairness remains the main guardrail when Generate or Live Split uses
attribute composition.

##### Basic profile and Detailed profile are both complete states

A player may legitimately use only Overall Skill.

This is a complete **Basic profile**, not an unfinished Detailed profile.

A Basic player card must not show:

- missing-profile warnings;
- an empty or permanently greyed-out radar as a nag;
- fabricated detailed attribute ratings;
- blank reserved space for Detailed-only content.

The flipped Basic card should instead present Overall cleanly, including an
Overall-focused visualization/description and a quiet optional action such as:

`Add detailed profile ›`

A user who chooses to maintain an Overall-only roster should never feel that
Stripes considers the roster incomplete.

The evaluator may use a neutral internal composition fallback where necessary
for an Overall-only player, but those neutral values are **not recorded player
ratings and must not be displayed as if reviewed**.

##### Detailed profile is optional accuracy enrichment

Detailed Profile is for organizers who want Stripes to record the player more
accurately and use that additional information throughout the product.

Once reviewed and saved, the detailed attributes are real persistent player
observations.

Core data-truth rule:

> **One recorded attribute value = one radar value = one evaluator input value.**

Do not store one number, visualize another and secretly optimize a third via
legacy trait boosts.

Detailed-profile information should materially improve:

- radar visualization;
- Generate;
- Live Split;
- Balance Priorities;
- team-composition evaluation;
- constrained-swap evaluation;
- built-in Playing Profile inference;
- future grounded “Why these teams?” explanations.

##### Three-attribute and six-attribute profiles

A Sport Definition may expose either three or six attributes.

The rating component, radar/triangle and evaluator must render from the active
Sport Definition rather than hard-code Football.

Current future Football v2 attribute direction:

1. Attack
2. Passing
3. Stamina
4. Defense
5. Technique
6. Pace

Migration rules:

- old Physical/Strength -> Technique is **not a rename**;
- old Physical values must never be silently reinterpreted as Technique;
- Speed -> Pace is mainly a semantic/display evolution and may retain internal
  compatibility during migration;
- built-in Sport Definitions must be versioned so historical roster semantics
  are not silently changed.

##### Special Role replaces the future Special Ability concept

For the future core, the categorical team-building concept is **Special Role**.

A Sport Definition may define zero or one optional Special Role.

Football example:

- Goalkeeper

Special Role is separate from the radar/attribute geometry and may create a
structural team-composition requirement.

The generic engine understands role coverage; it does not need to understand
the football word “Goalkeeper”.

Custom Sport/Game may optionally define its own one Special Role.

##### Team Play and legacy trait pile

The future T1 core should not depend on:

- the current Team Play multiplier;
- the large collection of algorithmic player-trait badges/boosts.

Legacy data must be preserved for compatibility/migration, not destructively
deleted.

Current traits may remain readable for old rosters during transition, but T1
must not casually reproduce their hidden stat mutations in the new generic
engine.

##### Detailed Profile rating mental model

The organizer should not be asked to invent six independent numbers from
scratch.

The rating question is relative to Overall:

> Compared with another player around this Overall level, what stands out?

Conceptually each attribute uses a small understandable range such as:

- much weaker;
- weaker;
- typical for this Overall;
- stronger;
- much stronger.

The relative language helps the organizer judge the player.

The resulting numeric attribute remains visible and persistent so profiles can
still be compared accurately.

Do not repeat five long textual choices six times on screen.

##### Six-row Detailed Profile input

For a six-attribute sport, Detailed Profile should use six **spacious horizontal
selection rows**, one per attribute.

Football example:

- Attack
- Passing
- Stamina
- Defense
- Technique
- Pace

Explain the horizontal scale once near the top, for example:

> WEAKER <-   -> STRONGER
> Center = typical for an Overall 7 player

Each row then remains visually simple.

Rows must be large enough for phone use so the finger does not hide the only
important feedback.

The active row and selected value must remain easy to see while touching the
screen.

##### One continuous zig-zag swipe

Mobile Detailed Profile should support a distinctive fast-input gesture.

The organizer may place a finger on the first attribute row and move downward
through all remaining rows in **one continuous gesture**.

Horizontal position on each crossed row chooses that attribute's snap level.

The resulting path naturally forms a zig-zag according to the player's
strengths and weaknesses.

This allows a six-attribute player profile to be mapped in roughly one gesture
instead of six separate forms.

The gesture is an accelerator, not a requirement.

The same component must also support:

- tapping individual values;
- tapping all six rows instead of swiping;
- swiping several rows then correcting others;
- editing one attribute later without repeating the full gesture.

Do not create a separate “swipe mode”.

##### Gesture behavior and feedback

During the one-swipe interaction:

- crossing a row activates it;
- horizontal position snaps to a valid level;
- re-entering a row may correct that row during the same gesture;
- selection feedback is immediate;
- the active value should be visible above/beside the finger rather than hidden
  underneath it;
- the radar preview updates live;
- pointer-up ends the continuous gesture but does not prevent tap corrections.

Where supported, subtle haptic ticks may reinforce row/snap selection.

Haptics remain supplemental and must never be required for understanding.

The implementation must deliberately solve vertical-scroll conflict. Once a
clear rating gesture begins inside the control, the interaction should not be
routinely stolen by page scrolling.

Real-device Android testing is mandatory before this interaction is considered
finished.

##### Detailed Profile onboarding and `?` help

Because the zig-zag gesture is unusual, Detailed Profile needs dedicated
onboarding.

A permanent but unobtrusive `?` help control should always allow the organizer
to replay it.

On first use, show a short animated, game-like tutorial that demonstrates:

1. the Overall reference;
2. weaker on the left, typical in the center, stronger on the right;
3. a fingertip beginning on the first attribute row;
4. the fingertip moving downward in a visible zig-zag;
5. each row snapping as it is crossed;
6. the selected value briefly emphasizing;
7. the radar forming live;
8. the fact that the user may also tap any row individually.

Suggested closing instruction:

> Swipe through all six — or tap any row to adjust.

The onboarding may optionally finish with a small practice interaction.

Rules:

- automatically show once;
- immediate Skip available;
- do not repeatedly auto-show after completion/dismissal;
- `?` always replays it;
- respect reduced-motion settings with a static/step-based alternative.

The experience should feel tactile and game-like, **not gamified**.

Avoid points, scores, achievements, confetti or exaggerated praise.

##### Radar behavior

For a saved Detailed profile, the radar is a visualization of actual recorded
data, not decoration.

The primary radar polygon must plot the exact stored attribute values.

A subtle Overall reference polygon may sit behind it to show how the player's
shape differs from the Overall baseline.

Example:

- muted polygon = Overall 7 reference;
- primary polygon = reviewed Attack/Passing/etc. values.

The Overall reference must remain visually secondary.

A Basic Overall-only player does **not** show a fake/empty radar simply for
layout consistency.

Once Detailed Profile exists, radar input, stored values and evaluator data
must remain consistent.

##### Playing Profile

Built-in sports may derive a human-readable **Playing Profile** from the
reviewed attribute shape.

Playing Profile is:

- derived only;
- presentation-only;
- not organizer-rated;
- not an optimization input;
- recomputable rather than authoritative persistent player truth;
- normally one or at most two complementary descriptions;
- based primarily on relative attribute shape rather than absolute Overall;
- text-only;
- optional when no meaningful shape stands out.

A low-Overall player and high-Overall player may therefore share the same
Playing Profile if their relative shapes are similar.

Possible Football vocabulary remains design material, not final hard-coded
copy.

**Custom Sport/Game has no Playing Profile in v1.**

The player-card layout must remain content-driven. If Playing Profile or Special
Role does not exist, no blank space should be reserved for it.

##### Balance Priorities replaces Field Size

The current Football **Field Size** team-generation control should be retired as
the normal way of changing balancing behavior.

Its real purpose was indirectly telling the algorithm which qualities matter
more for the current game.

Replace it with a session-only **Balance Priorities** modal/control.

Default:

> **Balanced**

Balanced gives equal/default composition attention to the active Sport
Definition's attributes.

The modal is populated directly from the active sport's attributes.

Football example:

- Balanced
- Attack
- Passing
- Stamina
- Defense
- Technique
- Pace

Custom board-game example:

- Balanced
- Strategy
- Negotiation
- Experience

Do not expose a permanent Low/Medium/High weighting configurator.

The exact number of simultaneous focused priorities remains a prototype
decision. Test whether one or two selected priorities is clearer than arbitrary
many.

Selecting most attributes should not create a meaningless pseudo-priority
state.

##### Same Balance Priorities for Generate and Live Split

Balance Priorities is one session concept shared by both team-building modes.

Generate uses the priorities when evaluating/searching complete team
arrangements.

Live Split uses the same priorities while:

- recommending the next player;
- matching round/anchor counterparts;
- protecting the quality of the remaining pool;
- placing late arrivals;
- proposing minimal corrections.

A priority affects **composition attention**, not the player's saved Overall.

For example, selecting Defense should make Stripes work harder to distribute
defensive ability fairly; it should not secretly transform an Overall-7 player
into an Overall-8 player.

##### Field Size is not part of the generic multi-sport core

The generic team model must not require Field Size.

Some users may use Stripes for basketball, volleyball, other sports or even
board games where the concept is meaningless.

If a future built-in sport genuinely needs a sport-specific session control,
its Sport Definition may expose one explicitly.

Custom Sport/Game has no built-in field-size/session-context assumption in v1.

##### Built-in versus Custom Sport/Game

The generic T1 engine should understand generic concepts:

- players;
- Overall Skill;
- attribute vectors;
- equal/default attribute-composition treatment;
- optional Special Role;
- hard constraints;
- team-size policy;
- partial/manual locks;
- candidate arrangements;
- structured team evaluation.

It must not fundamentally understand Football-specific labels.

Built-in sports may provide:

- three or six named attributes;
- optional Special Role;
- carefully justified sport-specific session controls;
- Playing Profile definitions;
- tuned explanatory language.

Custom Sport/Game creation should remain deliberately simple:

1. enter sport/game name;
2. choose three or six attributes;
3. name those attributes;
4. optionally define one Special Role;
5. create roster.

Custom v1 should **not** include:

- permanent per-attribute weighting;
- built-in sport contexts;
- Playing Profile/archetypes;
- Team Play;
- the legacy trait pile.

Custom attributes receive equal/default composition treatment unless a
temporary Balance Priority is selected for the current session.

##### Shared evaluator / Best Completion Engine

Generate and Live Split should ultimately use the same structured evaluation
foundation.

Conceptual priority order:

1. Overall fairness;
2. hard/structural requirements such as team size, Special Role and approved
   pairing constraints;
3. attribute composition;
4. temporary Balance Priorities/session emphasis.

Attribute composition must normally not be allowed to badly damage Overall
fairness.

The evaluator should return machine-readable metrics suitable for:

- Generate;
- Live Split;
- team comparison;
- constrained swaps;
- late-arrival placement;
- no-show repair;
- “Why these teams?” explanations;
- future grounded AI translation.

##### Live Split direction

Live Split addresses the real organizer problem that RSVP lists often differ
from who is actually present.

Generate remains appropriate when the participant set is settled.

Live Split is appropriate when attendance is uncertain/changing or the
organizer prefers manual formation with algorithmic assistance.

Core interaction:

- show a highly visible current team/color destination;
- tapping a player assigns them to that team and effectively confirms presence;
- destination advances round-robin;
- full teams are skipped according to team-size policy;
- avoid requiring player -> destination-picker for every assignment.

The first manually chosen player in a round/color loop may act as a temporary
anchor.

Stripes may highlight suggested counterparts for the remaining teams directly
in the unassigned pool.

Suggestions are non-blocking.

If the organizer ignores Stripes and selects another player:

> **Organizer defines reality; algorithm continuously adapts.**

Recommendations must be future-aware rather than locally greedy. They should
consider the entire remaining pool and best achievable completion so useful
balancing players are not all consumed early.

Live Split also requires:

- prominent persistent Undo;
- repeated Undo;
- restoration of cursor/anchor/recommendation state;
- minimal-correction handling for late arrivals;
- minimal-correction handling for assigned-player no-shows/removal;
- restrained human-readable balance warnings instead of raw optimizer scores;
- one-handed outdoor use;
- large touch targets;
- visible active destination while scrolling;
- color accessibility;
- support for 2, 3, 4+ teams and unavoidable uneven counts.

Exact Live Split layout remains a dedicated prototype task before coding.

##### AI trust boundary

Future AI assistance may interpret natural-language organizer requests, but the
structured/deterministic evaluator remains authoritative.

Required pattern:

1. AI translates the request into visible structured settings;
2. Stripes shows what it understood;
3. the evaluator acts;
4. the explanation reports grounded effects.

Example:

> “Blue looks too weak defensively.”

may become a visible Defense priority or constrained-swap request.

AI must not invent attributes that do not exist in the active Sport Definition.

##### Current generator migration implications

The current Football generator must be treated as legacy behavior to audit and
regression-test, not as generic architecture to rename.

Important current-state issues already identified include:

- displayed/saved Overall uses a different model from generation weighted
  skill;
- current generator Field Size matrices change weighted skill;
- Physical contributes little to current Overall and is omitted from current
  generation weighted skill/team-stat rows;
- current greedy generation contains hard-coded female and speed-based runner
  passes;
- `not_here_yet` currently receives a strong generation discount;
- pairing-rule cleanup is swap-based and cannot repair team-size spread;
- current trait effects create hidden stat coupling;
- GK is currently visual metadata rather than genuine generator role coverage;
- local/shared conversions do not feed identical trait information into
  balancing.

T1 must make these concepts explicit, intentionally migrate them or retire them.
Do not simply rename the current heuristics.

The detailed numeric audit and regression implications are recorded in:

`docs/design/T1_PLAYER_PROFILE_TEAMING_SPEC_2026-08-17.md`

##### Open T1 implementation questions

The following remain deliberately unresolved and must **not** be silently
decided during coding:

1. exact numeric mapping of the five relative snap positions, particularly near
   Overall 1/10 boundaries;
2. whether the first release needs half-step fine adjustment;
3. whether Detailed Profile supports an explicit per-attribute
   unknown/not-sure state;
4. exact maximum simultaneous Balance Priorities;
5. exact compact-radar size/layout above the six rating rows;
6. animation-only versus interactive-practice onboarding ending;
7. final Football Playing Profile vocabulary/thresholds;
8. exact Best Completion search/performance strategy;
9. future gender/composition treatment — do not automatically preserve the
   current hard-coded female bucket;
10. exact migration path for current Football attributes, Team Play and legacy
    traits.

These are legitimate implementation stop points requiring an explicit product
decision.

##### T1 implementation guardrails

This is a design checkpoint, not authorization to begin a broad algorithm
rewrite.

Before replacing the current generator:

1. add focused regression scenarios for current behavior;
2. define/version Sport Definition and player-profile persistence semantics;
3. prototype the Detailed Profile six-row/one-swipe interaction on a real
   phone;
4. validate snap mapping, finger visibility and scroll behavior;
5. define structured evaluator metrics;
6. implement the shared evaluator and Generate/Live Split in small atomic
   phases.

The existence of this design work does not silently reorder unrelated locked
roadmap phases.

### QT — Quick Teams

**Status:** APPROVED PRODUCT / CREATIVE DIRECTION — NOT IMPLEMENTED.

Quick Teams is a small, self-contained, playful utility inside Stripes. It is
separate from T1 Multi-Sport Team Generation.

T1 is the serious deterministic fair-team architecture using saved rosters,
player ratings, Sport Definitions, attributes, Special Abilities, Balance
Priorities and sport rules. Quick Teams deliberately does not replicate that
system.

#### QT.0 — Product purpose

Quick Teams exists for moments when somebody simply needs to divide people
into teams or groups immediately, including:

- spontaneous sports teams;
- pairs;
- party/game groups;
- classroom groups;
- workshop groups;
- event teams;
- volunteer groups;
- other one-off grouping scenarios.

It should be:

- stupidly simple;
- genuinely useful;
- extremely fast;
- playful;
- memorable;
- disposable by default.

A new user should understand and use it immediately without a tutorial. Quick
Teams may be one of the first Stripes interactions a new user sees, so its
creative quality matters disproportionately to its technical complexity.

It should function simultaneously as:

- a useful tool;
- a small playful/kinetic experience;
- a subtle trailer for the deeper Stripes fair-team generator.

#### QT.1 — Placement

Do not add Quick Teams as a permanent app tab.

Place it on the existing Choose Roster / landing page as a clearly separate
cameo utility. Persistent saved rosters remain the main Stripes workflow.

Possible entry copy:

**Quick Teams**

Make one-off teams in seconds. No roster needed.

The exact final name/copy remains open to creative-direction work. Do not
introduce a separate product or sub-brand.

#### QT.2 — One-screen experience

Quick Teams opens as one contained experience:

- full-screen sheet/contained takeover on mobile;
- large contained modal/dialog on desktop and tablet.

It must not navigate the user through Roster, Today, the Teams tab, Club or
multi-step setup pages. Conceptually everything happens on one screen.

No wizard. No **Step 1 of 3**.

#### QT.3 — Core interaction

Keep the grouping logic deliberately simple.

Minimum interaction:

**Input**

- type names;
- paste names, ideally one per line;
- optionally use AI-assisted Speak input.

**Setting**

- choose **TEAMS OF X**;
- update the resulting team count/sizes immediately;
- show truthful live feedback such as **12 PEOPLE → 3 TEAMS**;
- for uneven counts, show the actual resulting group sizes immediately.

**Main action**

- use a playful direct action such as **SHUFFLE** rather than formal wording
  such as **Run team-generation algorithm**.

**Result actions**

- Shuffle again;
- Edit names;
- subtle Export;
- Close/Done.

Results remain in the same contained screen.

#### QT.4 — Random grouping, not fair-team generation

Quick Teams performs fast random/even grouping.

Do not add:

- Skill ratings;
- Football attributes;
- custom three/six-attribute profiles;
- Balance Priorities;
- Goalkeeper/Special Ability logic;
- field size;
- pairing constraints;
- team history;
- AI optimization;
- sport-specific balancing.

Those belong to the proper T1 Team Generator.

The distinction is intentional:

**Quick Teams**
→ fast, random, playful.

**Stripes Team Generator**
→ informed, deterministic, genuinely fair team composition using saved player
information.

Resist feature creep.

#### QT.5 — Extremely fast name entry

Name entry is the biggest friction point.

The primary universal method is a large conventional paste/type field that:

- supports one name per line;
- parses the list immediately;
- shows a live person count;
- makes parsed names immediately editable/removable.

Avoid requiring **Add person → Save → Add person → Save** for each person.
Bulk entry should feel instantaneous.

#### QT.6 — AI-assisted Speak input

Quick Teams is a high-value location for narrow AI-assisted voice input. Place
a Speak control beside conventional text/paste entry.

Example spoken input:

> Okay, we have Joon, Maria, Peter, Daniel is playing too, and Marco.

AI responsibility is deliberately narrow: extract people's names only and
populate the editable list.

Do not turn this into a chatbot or return conversational assistant prose such
as **Sure, I added these five players.** Names should simply appear.

Requirements:

- manual type/paste always works without AI;
- voice/AI is a convenience, never a dependency;
- AI is conservative about uncertain names;
- AI never knowingly invents names;
- uncertain extraction remains visibly editable/correctable;
- the user can immediately remove or edit mistaken names.

This AI use removes input friction. It does not add intelligence to the random
grouping algorithm.

#### QT.7 — Export and professional usefulness

After teams are generated, provide a subtle Export action. It must not compete
visually with Shuffle.

Suggested export menu:

- Copy teams;
- Download CSV.

CSV remains simple and spreadsheet-friendly:

```csv
Team,Name
Blue,Joon
Blue,Maria
Red,Peter
Red,Daniel
```

Export is an output convenience, not another workflow. A future
**Save as roster** option may be considered separately but is not required for
Quick Teams v1.

#### QT.8 — Creative direction

Do not make the primary aesthetic **retro arcade software**.

Avoid relying on:

- pixel-art clichés;
- fake CRT screens;
- heavy scanlines;
- arcade coins;
- high scores;
- forced 8-bit styling;
- novelty-game theming.

Preferred direction: a clean modern Stripes interface containing a small
kinetic/playful team-making machine.

Desired emotional qualities:

- utilitarian;
- direct;
- playful;
- nerdy;
- tactile;
- satisfying;
- slightly eccentric;
- still unmistakably Stripes.

Subtle retro/technical references may appear through counters, compact
monospace accents, **READY**, responsive numerical feedback and
mechanical/kinetic behavior. Playfulness should primarily come from interaction
and motion, not decorative retro styling.

#### QT.9 — Key visual moment

The most important creative moment is a loose pile/list of people transforming
into colored teams. Stripes themselves should ideally perform or communicate
that transformation:

1. each name becomes a neutral strip/token;
2. the user presses Shuffle;
3. strips briefly interleave, move or deal;
4. strips separate into Stripes team colors;
5. names resolve into the resulting teams.

The reveal should be quick and satisfying, not a slow loading animation. It
should communicate the Stripes identity:

**people → shuffle → colored teams**

Spend disproportionate design attention on this moment.

#### QT.10 — Responsive interaction

Mobile:

- use a full-screen sheet/contained takeover;
- preserve the one-screen conceptual flow;
- use large tap targets;
- support fast keyboard and voice entry.

Desktop/tablet:

- use a large contained modal/dialog;
- do not unnecessarily navigate away from Choose Roster.

Closing Quick Teams returns immediately to the existing Choose Roster / landing
context.

#### QT.11 — First-use role

Quick Teams may be particularly prominent when the user is new or no saved
roster exists. It can provide a zero-commitment demonstration of Stripes:

**Got some names? Make teams now.**

For established users with saved rosters, Quick Teams remains convenient but
secondary to the normal roster workflow. Do not force returning organizers
through Quick Teams whenever the app loads.

#### QT.12 — Relationship to the serious Team Generator

Quick Teams should quietly reveal that deeper Stripes functionality exists
without becoming an advertisement. After results, a subtle optional line or
action may eventually say:

**Need genuinely balanced teams? Use a Stripes roster →**

Avoid aggressive upsell language or feature tours. The immediate Quick Teams
result remains the focus.

#### QT.13 — Central product principle

**Quick Teams may use sophisticated input and output conveniences, while the
grouping interaction itself remains stupidly simple.**

Sophisticated input:

- paste;
- fast parsing;
- AI voice name extraction.

Simple middle:

- Teams of X;
- Shuffle.

Useful output:

- reshuffle;
- copy;
- CSV export.

This simplicity is intentional.

#### QT.14 — Creative process before engineering

Do not ask Codex to invent the final visual design from a vague instruction
such as **make a cool retro Quick Teams interface**.

Before implementation:

1. prepare a short QT creative brief;
2. explore approximately two or three visual/interaction directions;
3. choose and refine the strongest direction;
4. define exact interaction states, copy and animation behavior;
5. give Codex a bounded implementation specification.

Creative direction comes before engineering because Quick Teams may be a
user's first impression of Stripes.

#### QT.15 — Initial implementation scope when scheduled

**Conceptual QT1:**

- Choose Roster/landing-page Quick Teams entry;
- one-screen responsive modal/sheet;
- bulk text/paste name entry;
- editable parsed names;
- team-size selector;
- live group-count/size calculation;
- random team allocation;
- same-screen result;
- Shuffle Again;
- Edit;
- Copy;
- CSV export;
- close/discard.

AI Speak may be included in QT1 if the existing AI/voice infrastructure makes
it clean and reliable. Otherwise, it may be a tightly scoped QT1.x addition
without changing the interaction model.

**Conceptual QT2:**

- final kinetic Stripes shuffle/reveal polish;
- animation/accessibility refinement;
- onboarding/first-use tuning;
- only then consider optional save/promote behavior if genuinely useful.

#### Explicit exclusions

Quick Teams v1 must not become:

- another tab;
- a new core product pillar;
- another roster system;
- a multi-sport profile editor;
- another advanced optimizer;
- a Club feature;
- a social/chat feature;
- an AI conversation surface.

Its strength comes from being intentionally small.

#### Roadmap relationship

Keep the tracks distinct:

**T1**
= Multi-Sport / Custom Sport deterministic fair-team architecture.

**QT**
= lightweight one-off random team/group utility and first-use playful
experience.

QT may reuse generic utilities where sensible, but must not block or complicate
T1 architecture. Do not merge the two roadmaps merely because both eventually
produce groups of people.

Do not begin QT implementation from this product record. Complete the QT
creative brief and direction selection first, then schedule the bounded QT1
implementation independently from T1 and G2.

<!-- STRIPES_CURRENT_ARCHITECTURE_END -->

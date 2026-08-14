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

- reuse the existing unified Google identity/session where appropriate;
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

Stripes owns:

- organization;
- context;
- metadata;
- relationships between resources and Action Board/Equipment/etc.

Google owns:

- actual document/file bytes;
- file-level access and sharing;
- native editing/preview behavior where applicable.

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

Initial access should follow organizer-level shared-roster permissions.

Do not build Drive-style granular per-file or per-folder permissions for the
first Cabinet version.

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
- Club Notes

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

### Club Notes → Club Cabinet

Club Notes remain free as a lightweight shared organizer tool.

Primary purpose:

- quick notes
- reminders
- lightweight institutional memory
- useful links

Do not overbuild Club Notes into a document editor.

The paid tier may evolve this area into a more substantial:

**Club Cabinet**

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
governance review.

This section is the authoritative current direction where older roadmap
storage/ownership wording conflicts with it.

## Current phase status

- P0-P5 initial UI consolidation and regression pass are complete.
- P5 regression checks remain an ongoing launch gate for subsequent work.
- W1 Public Website / Launch Readiness is complete.
- W2 Meetup application is submitted / waiting for API access.
- Meetup must not block the Google Play launch.
- G1.4 protected organizer-removal governance is complete and live.
- Current active atomic task: G1.5 Organizer invitation + verified-email
  onboarding.
- Google implementation follows completion of the remaining G1 governance /
  onboarding work rather than preceding it.

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

Reuse the existing Google identity/session where technically appropriate and
request additional permissions only when a capability requires them.

Do not hard-code the architecture around one OAuth scope before the existing
Cloud Backup implementation and current Google Drive requirements are audited.

Use the narrowest permission that can reliably deliver the promised behavior.

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

Next atomic task:

**G1.5c — invitation onboarding, verification and continuation UX.**

G1.5a–G1.5c must ship together after recipient verification/onboarding is
complete and verified rather than being deployed independently.

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
  - restrict Firebase, Google Cloud, Vercel, GitHub and other production-admin
    access to necessary maintainers;
  - require strong authentication / 2FA on production administrator accounts;
  - review API keys, secrets and Firebase Secret Manager usage.

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

Inspect and consolidate:

- existing Cloud Backup Google auth;
- existing scopes/token behavior;
- incremental permission capability;
- Google Picker behavior;
- managed My Drive Cabinet-folder creation/selection;
- multi-organizer permissions inside a shared My Drive Cabinet;
- ownership behavior for files created by different organizers;
- reconnect/handoff behavior when the My Drive storage host changes;
- optional Shared Drive discovery/selection;
- capability detection between My Drive and Shared Drive modes;
- required permissions for each mode;
- Google verification consequences.

Do not hard-code the Google connection around Shared Drive.

Use the narrowest OAuth permissions that can reliably deliver the promised
behavior.

Do not break working Cloud Backup behavior merely to create a cleaner new
integration.

### G3 — Google Resource + Club Cabinet Foundation

Implement only after G1/G2 decisions are verified.

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

Each G phase must remain atomic and independently revertible according to
AGENTS.md.

### T1 — Team Generation Quality + Customization Pass

**Status:** PLANNED / DO NOT IMPLEMENT DURING G1.5–G3.

Team generation remains a core Stripes differentiator and receives a dedicated
quality/design pass before final launch regression.

Do not casually rewrite current Football behavior.

First collect real match examples, identify where the current model feels
wrong, define expected reasoning, and establish regression tests.

#### Uneven player counts — real futsal observation

A real 9-player futsal match exposed an important distinction.

With no substitute rotation, the game was a true 4 vs 5.

The current generated teams felt unbalanced because the five-player team's
numerical advantage dominated the normal skill balance.

In that situation, the four-player team should intentionally contain stronger
players so that Stripes balances effective match strength rather than merely
similar skill totals/averages.

However, if substitutes rotate so that both sides always have the same number
of active players, this compensation should NOT be applied.

Future generation should therefore distinguish:

- **No subs / unequal active team sizes**
  - e.g. permanent 4 vs 5;
  - compensate the smaller side with stronger players.

- **With subs / equal active team sizes**
  - roster sizes may differ;
  - the same number of players are active at once;
  - use normal balancing without artificial headcount compensation.

Avoid adding a permanent settings panel.

When player numbers cannot divide evenly, prefer a small contextual question
such as:

**Will you rotate substitutes?**

The compensation model must be designed/tested using real match scenarios
rather than guessed.

#### Lightweight team-building customization

Organizers need meaningful control without learning algorithm weights.

Example requests:

- "Make a different variation from last week."
- "Put Vivian and Paul on the same team."
- "Keep these two players apart."
- "Make sure every team has at least one runner."
- "Spread the good defenders across the teams."
- "Blue looks too weak defensively."

Text and/or the existing Speak/voice interaction may provide this input.

AI must NOT independently invent teams.

Preferred model:

natural-language request
→ AI interpretation
→ explicit structured constraints/preferences
→ user sees what Stripes understood
→ deterministic generator optimizes under those constraints

Example interpreted preferences:

- Keep Vivian + Paul together
- At least one runner per team
- Distribute strong defenders
- Avoid last week's main combinations

This transparency is particularly important for organizers who distrust a
black-box balancing algorithm.

Post-generation AI should use constrained swaps/optimization and explain the
effect rather than arbitrarily regenerating teams.

Future T1 design should cover:

- uneven-headcount compensation;
- substitute/no-sub match format;
- variation/history awareness;
- together/apart constraints;
- minimum role/attribute coverage;
- runner/defender distribution;
- natural-language/voice customization;
- grounded post-generation swaps;
- "Why these teams?" explanations.

#### Multi-sport relationship

T1 should be designed alongside the later multi-sport model without cluttering
the current Football UI.

Initial sport direction:

- Football
- Volleyball
- Basketball

Prefer shared sport-neutral generation infrastructure with sport-specific
presets/strategies.

Football remains the regression baseline.

Volleyball/Basketball should hide football-only controls instead of adding
irrelevant options to every sport.

Before implementation, brainstorm the sport models and UI carefully so
multi-sport support does not introduce unnecessary permanent interface.

<!-- STRIPES_CURRENT_ARCHITECTURE_END -->

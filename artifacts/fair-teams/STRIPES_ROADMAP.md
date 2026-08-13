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
- Current next architecture phase: G1 Shared Workspace Governance.
- Google implementation follows governance reconciliation rather than
  preceding it.

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

## Full Club Cabinet managed storage

The full managed Club Cabinet file system should use an eligible
Google Workspace Shared Drive.

Reason:

- Shared Drive files belong to the organization rather than one organizer;
- organizer turnover therefore does not make one person's account the
  permanent owner of the club archive;
- Google remains responsible for file-level access and Shared Drive membership;
- Stripes can focus on club organization, context and workflow.

A Google Workspace account alone is not sufficient.

The organizer must have access to an eligible Shared Drive with the permissions
required for the requested Cabinet operations.

If no eligible Shared Drive is available, Stripes should explain this clearly.

The user does NOT need Google Workspace to use Stripes generally.

Without a Shared Drive they may still:

- use all normal Stripes core functionality;
- attach individual Google Drive files where supported;
- use Google's normal sharing/access-request behavior;
- paste ordinary external links.

## Cabinet folders

For a managed Club Cabinet connected to a Shared Drive:

- Cabinet folders correspond to real Google Shared Drive folders;
- creating a Cabinet folder creates the corresponding Shared Drive folder;
- renaming a managed Cabinet folder renames the Shared Drive folder;
- moving a managed Cabinet file/folder updates its real Shared Drive location;
- files uploaded through Cabinet are stored in the selected Shared Drive
  folder;
- files uploaded contextually from Action Board / Equipment may be saved into
  an appropriate Cabinet/Shared Drive location;
- one underlying Google file may remain connected to multiple Stripes
  contexts without duplication.

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

The Google/Cabinet setup must explain the difference between My Drive and a
Shared Drive without turning setup into an IT lesson.

Provide concise contextual help, for example through a `?` information modal.

The explanation should make clear:

My Drive:
- files are owned by an individual Google account;
- other organizers may need to request access;
- normal Google permissions apply.

Shared Drive:
- intended for organizations using Google Workspace;
- files belong to the organization;
- recommended/required for the managed Club Cabinet;
- files remain with the organization as individual organizers change.

Also state:

- Google Workspace is not required to use Stripes;
- Stripes does not override Google permissions;
- normal Google access-request behavior is expected for private resources.

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

### G2 — Unified Google Connection

Inspect and consolidate:

- existing Cloud Backup Google auth;
- existing scopes/token behavior;
- incremental permission capability;
- Google Picker behavior;
- Shared Drive discovery/selection;
- required permissions;
- Google verification consequences.

Do not break working Cloud Backup behavior merely to create a cleaner new
integration.

### G3 — Google Resource + Club Cabinet Foundation

Implement only after G1/G2 decisions are verified.

Initial goals:

- individual Google resource references;
- eligible Shared Drive connection;
- managed real-folder Cabinet model;
- Action Board contextual attachment;
- Firestore metadata/context relationships;
- clear unavailable/permission states.

Each G phase must remain atomic and independently revertible according to
AGENTS.md.

<!-- STRIPES_CURRENT_ARCHITECTURE_END -->

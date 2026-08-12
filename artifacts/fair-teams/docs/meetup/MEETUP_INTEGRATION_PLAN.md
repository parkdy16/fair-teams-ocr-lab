# Stripes Meetup Integration Plan

Status: Waiting for Meetup API eligibility confirmation.
Submitted: 2026-08-12

## Goal

Allow a recreational-sports organizer to connect their own Meetup account,
choose one of their upcoming events, and import the people who RSVP'd as
attending into Stripes for today's player selection and team generation.

The integration is intentionally read-only.

## What Stripes will do

1. Organizer connects Meetup.
2. Stripes shows relevant upcoming Meetup events available to that organizer.
3. Organizer chooses an event.
4. Stripes reads the event RSVP/member list.
5. Stripes compares Meetup member names with the existing Stripes roster.
6. Matching screen shows:
   - Matched
   - Possible match
   - Not found
7. Organizer reviews ambiguous names.
8. Organizer confirms.
9. Matched players become today's selected players in Stripes.
10. Team generation continues normally.

## What Stripes will NOT do

- Change Meetup RSVPs.
- Create or edit Meetup events.
- Send Meetup messages.
- Scrape Meetup pages.
- Replicate Meetup discovery.
- Import unrelated groups.
- Automatically add unknown Meetup members to the permanent roster without
  organizer confirmation.

## Authentication

Use Meetup OAuth 2 server flow.

Production callback:

https://stripes.work/auth/meetup/callback

Client secret must never be exposed to the browser.

OAuth token exchange and refresh should run server-side, using the existing
Stripes Firebase backend / secret-management pattern.

## API

Current Meetup GraphQL endpoint:

https://api.meetup.com/gql-ext

For the first implementation, request only the fields needed for the import,
ideally:

- Event ID
- Event title
- Event date/time
- Group ID/name
- RSVP member ID
- RSVP member display name

Do not request member email unless a future feature genuinely requires it.

## Stripes UX

### Connection

Place Meetup connection under the organizer/Club area as an optional connected
service:

Meetup
Not connected / Connected as [name]
Connect / Disconnect

Connecting Meetup should not be required to use Stripes.

### Import

Place the actual import action in the team setup / today's player-selection flow:

Import from Meetup

Flow:

Choose event
→ Review matches
→ Confirm today's players

The user should never need to visit Club settings every time they import an
event after the account has already been connected.

## Matching

Matching priority:

1. Exact normalized roster name
2. Known AKA / alternate name
3. Strong fuzzy candidate
4. Manual organizer selection
5. Leave unmatched

Never silently select a weak fuzzy match.

## Data minimization

Do not build a permanent copy of Meetup's RSVP database.

Use the RSVP list for the organizer-requested import and retain only information
that Stripes genuinely needs afterward.

Normal Stripes roster and attendance data remains governed by Stripes' own
storage model and Privacy Policy.

## Failure behaviour

If Meetup is unavailable or authorization expires:

- Existing Stripes rosters continue to work.
- Manual player selection continues to work.
- Team generation continues to work.
- Show a simple reconnect/retry message.

Meetup must remain an optional convenience, not a dependency.

## Implementation after approval

1. Obtain Meetup OAuth consumer.
2. Register production callback.
3. Store Meetup client secret in Firebase Secret Manager.
4. Add server-side authorization and callback endpoints.
5. Add token refresh handling.
6. Test authenticated `self` GraphQL query.
7. Query organizer-accessible upcoming events.
8. Query selected event RSVP/member names.
9. Build roster matching preview.
10. Connect confirmation to today's player selection.
11. Add disconnect/revoke flow.
12. Privacy/security regression pass.

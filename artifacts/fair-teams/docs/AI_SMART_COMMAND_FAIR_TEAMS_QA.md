# AI Smart Command Fair Teams Q&A Knowledge

This patch teaches the assistant to answer Fair Teams product questions with app-specific knowledge instead of generic sports-app language.

## Main fix

Questions such as:

```text
What is the difference between non-shared roster rating and normal rating in detail?
```

should no longer produce a generic answer about performance metrics. The assistant should explain the Fair Teams model:

- local/private/non-shared roster rating is the normal private rating used by the organizer and the local team generator;
- private/local rosters can use the full player profile, including main skill/OVR, advanced private attributes, and special traits where available;
- shared/Club rosters use private per-organizer rating submissions;
- individual organizer ratings are not shown to other organizers;
- shared/Club team generation uses the Club average/consensus rating;
- collaborators generally see the Club average after rating that player themselves;
- skipped/unrated players can be rated later.

## Product behavior rule

The assistant should now treat Fair Teams product questions as first-class conversation, with no actions unless the user asks to change something.

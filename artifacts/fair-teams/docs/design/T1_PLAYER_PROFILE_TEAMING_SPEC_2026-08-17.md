# T1 Player Profile + Teaming UX Specification

Status: **DESIGN CHECKPOINT — APPROVED DIRECTION, NOT YET IMPLEMENTED**
Date: **2026-08-17**

This document records the detailed T1 product and UX decisions reached before implementation. It is intentionally more specific than a normal roadmap entry so that a later Codex/engineering pass can implement the intended behavior without reconstructing product intent from chat history.

The authoritative roadmap remains `STRIPES_ROADMAP.md`. The roadmap should summarize and link to this document; if the two conflict, stop and resolve the conflict before coding.

---

## 1. Core product principle

Stripes must make player rating useful at two levels without making the simple level feel incomplete.

**Basic profile** answers:

> How good is this player overall?

**Detailed profile** answers:

> What shape does that ability take — where is this player stronger or weaker than other players around the same Overall level?

The extra work of creating a Detailed profile must improve real product behavior. It is not decorative metadata. Reviewed attribute values must feed:

- the radar visualization;
- Generate;
- Live Split;
- Balance Priorities;
- team composition evaluation;
- built-in-sport Playing Profile inference;
- future constrained-swap and “Why these teams?” explanations.

Core trust rule:

> **One recorded attribute value must mean the same thing everywhere Stripes uses or displays it.**

Do not store one number, draw another, and secretly optimize a third via hidden trait boosts.

---

## 2. Overall Skill is the strength anchor

### 2.1 Overall is required

Every player has an organizer-authored **Overall Skill**. Overall remains the primary measure of player strength and the dominant fairness anchor in team formation.

The user should be able to maintain a complete useful roster using Overall alone.

### 2.2 Attributes describe ability shape

Sport attributes describe *how* a player is good, not a second hidden definition of how good the player is.

Example:

- Marco — Overall 7
- Attack 9
- Passing 8
- Stamina 7
- Defense 6
- Technique 9
- Pace 8

The intended interpretation is:

> Marco is fundamentally an Overall-7 player, with unusually strong Attack/Technique/Pace for that level and weaker Defense.

### 2.3 Attribute edits do not silently recalculate Overall

Changing Attack, Defense, Technique, etc. must **not silently change Overall**.

Likewise, changing Overall later must **not silently move reviewed attribute values**.

If an extreme contradiction is detected, Stripes may offer a non-blocking review hint such as:

> This detailed profile looks unusually strong for Overall 4. Review Overall?

This should be rare, quiet, dismissible, and never force a change.

### 2.4 No fake precision contract

The UX should help organizers make consistent judgments, not imply that casual sports observations have laboratory precision.

The first Detailed-profile implementation should prefer a small number of clearly understandable snap levels. Exact internal numeric mapping can be tuned after prototype testing, but the visible interaction must remain simple.

---

## 3. Basic profile is complete, not incomplete

A player with Overall only is **fully rated for Basic use**.

Do not show:

- “incomplete profile”;
- “missing ratings”;
- permanently greyed-out Detailed controls;
- a filled radar that pretends six attributes were actually reviewed.

### 3.1 Basic flipped-card state

The flipped/back player card should remain polished and useful without a radar.

Recommended content:

- player name;
- Overall value;
- a simple Overall visualization or scale;
- concise plain-language Overall description;
- quiet optional action: `Add detailed profile ›`.

Do not reserve empty radar/Playing Profile space. The card layout must be content-driven.

### 3.2 Neutral fallback is internal only

The team evaluator may need a neutral composition fallback for an Overall-only player. If so, it may treat unknown attributes as neutral around Overall **for calculation purposes only**.

That fallback must not be persisted or presented as if the organizer rated those attributes.

Basic means:

> We know the player’s general strength; we do not claim to know the detailed shape.

---

## 4. Detailed profile data model

### 4.1 Reviewed attributes are real recorded values

Once a Detailed profile is saved, its attribute values are real persistent observations.

The radar plots those exact values.

The evaluator consumes those exact values, subject only to clearly documented team-evaluation logic. No old Special Ability trait boosts should secretly mutate them.

### 4.2 Three or six attributes

A sport definition may expose 3 or 6 player attributes.

The Detailed-profile component must be generated from the active sport definition rather than hard-coded to Football.

### 4.3 Football v2 proposed attributes

Current approved direction for the future Football profile:

1. Attack
2. Passing
3. Stamina
4. Defense
5. Technique
6. Pace

Important migration semantics:

- current `Physical/Strength` -> future `Technique` is **not a rename** and must never reinterpret old Physical values as Technique;
- current `Speed` -> future `Pace` is largely a semantic/display evolution and may retain compatibility internally during migration;
- schema/version boundaries must preserve old roster meaning until explicit migration.

### 4.4 Special Role is separate

A sport may optionally define one categorical **Special Role** concept.

Football example:

- Goalkeeper

Special Role is not an attribute and should not be folded into the radar.

It may influence team construction structurally.

### 4.5 Retire the maximalist algorithmic trait pile from the future core

The T1 future core should not depend on the current large set of trait badges/boosts or Team Play multiplier.

Legacy data must be preserved for old roster compatibility/migration, not destructively deleted.

---

## 5. Detailed Profile entry point

From the Basic profile/card, the user may choose:

> `Add detailed profile ›`

Detailed profiling is optional enrichment.

The language should communicate value, not incompleteness. Avoid “complete profile.” Prefer “Detailed profile,” “Add player profile,” or similar.

On first use, the user should be taught the fast gesture before being asked to understand a dense statistics form.

---

## 6. Detailed Profile rating interaction — six roomy rows

### 6.1 Why this interaction exists

The organizer should not face 30 simultaneously labelled choices or six cramped conventional sliders.

The control should make it easy to mentally map a player against peers at the same Overall level while still recording an accurate attribute shape.

### 6.2 Layout

For a six-attribute Football profile, render six large horizontal selection rows:

- Attack
- Passing
- Stamina
- Defense
- Technique
- Pace

Each row has a small number of large horizontal snap positions.

The conceptual scale is:

- much weaker for this Overall level;
- weaker;
- typical;
- stronger;
- much stronger.

Do **not** repeat those five long labels on every row.

Explain the scale once near the top, e.g.:

> **WEAKER <-   -> STRONGER**
> Center = typical for an Overall 7 player

Each row can then remain visually clean.

### 6.3 Visible numeric meaning

Relative language helps judgment; numbers preserve comparability and data truth.

After selection, the row should make the resulting concrete attribute value visible without making the number the primary cognitive task.

Example:

> Attack — Stronger · 8

The exact mapping from relative snap positions to numeric values must be prototyped. A simple OVR +/- 1 / +/- 2 model is an initial candidate, but do **not** hard-lock naive clamping near 1 or 10 if it causes multiple visible snap positions to collapse to the same value.

The implementation phase must explicitly solve edge behavior for Overall near the scale boundaries.

### 6.4 Row size / finger visibility

Rows must be intentionally spacious on phones. The user must be able to see the active row and selected position while a finger is on the control.

Requirements:

- large touch targets;
- enough vertical separation that adjacent rows are not accidentally selected;
- selected state shown above or beside the finger rather than directly underneath it;
- active row visibly emphasized;
- labels remain readable in sunlight/outdoor use;
- no important state conveyed by color alone.

Do not compress the component merely to fit more surrounding UI. The profile input itself is the task.

---

## 7. One-swipe zig-zag input

### 7.1 Core gesture

The user may create the whole profile with **one continuous downward gesture**.

They place a finger on the first attribute row and move downward through the remaining rows. Their horizontal position on each row selects that row’s snap level.

The path naturally becomes a zig-zag according to player strengths and weaknesses.

Conceptual example:

- Attack -> much stronger
- Passing -> stronger
- Stamina -> typical
- Defense -> weaker
- Technique -> much stronger
- Pace -> stronger

This should feel closer to drawing a quick player signature than filling a six-field form.

### 7.2 Tap remains first-class

The gesture is an accelerator, never the only input method.

The user can:

- tap each row individually;
- swipe through all rows;
- swipe through several rows and then tap corrections;
- later edit just one attribute.

There should not be a separate “Swipe mode.” The same row component supports both interactions.

### 7.3 Gesture behavior

Implementation should follow these interaction rules unless prototype testing proves a better variant:

- pointer/finger entry into a row activates that row;
- horizontal position snaps to the nearest valid level;
- crossing another row updates that row immediately;
- re-entering a row may update it again, allowing correction during the same gesture;
- selection feedback is immediate;
- the radar preview updates live;
- pointer-up ends the gesture but does not prevent subsequent tap corrections;
- Save/Done remains the clear persistence boundary for first-time profile creation.

Avoid accidental marking of a player as Detailed merely because the user opened the screen and closed it.

### 7.4 Scroll conflict

A vertical zig-zag gesture can conflict with page scrolling. The implementation must solve this deliberately.

Preferred design direction:

- the six rows should fit in a dedicated profile-editing viewport/sheet whenever practical;
- once a pointer-down clearly begins inside the rating interaction, the component may capture the gesture after a small movement threshold;
- do not create a control that becomes unreliable because the page scrolls instead of rating;
- preserve ordinary scrolling outside the active rating area.

This needs real-device testing on common Android screen sizes.

### 7.5 Haptics

Where supported, a subtle haptic tick when snapping to a level or crossing into a new row can improve confidence.

Haptics must be supplemental, not required to understand the interaction.

### 7.6 Desktop/pointer behavior

Desktop must remain usable without a touch gesture.

At minimum:

- click any snap level;
- keyboard-accessible adjustment;
- pointer drag may update rows if it remains predictable.

Do not make desktop users imitate a mobile gesture unnecessarily.

---

## 8. Live radar during rating

### 8.1 Radar is a verification tool

The radar is not decorative. During Detailed-profile editing, it should help the organizer recognize whether the resulting shape actually resembles the player they know.

### 8.2 Exact-value rule

For a saved Detailed profile:

> **stored attribute value = radar value = evaluator input value**

No hidden conversion layer for display.

### 8.3 Overall reference baseline

When a Detailed profile exists, a subtle reference polygon may show the player’s Overall level across all axes.

Example:

- muted reference shape = Overall 7 baseline;
- primary polygon = reviewed attribute values.

The reference makes strengths/weaknesses relative to Overall visually obvious.

It must remain visually secondary so users do not confuse it with a second data series.

### 8.4 Basic profile has no radar

Do not show a grey empty radar on every Overall-only player merely for consistency. That would make Basic users feel as though they are ignoring unfinished work.

Basic and Detailed are both legitimate complete card states.

---

## 9. Detailed Profile help/onboarding

### 9.1 Permanent `?` control

Detailed Profile must include a visible but unobtrusive `?` help icon.

It should always allow the user to replay the interaction demonstration.

### 9.2 Automatic first-use onboarding

The first time a user enters Detailed Profile, show a short game-like animated onboarding.

It should teach two concepts simultaneously:

1. **gesture:** swipe from the first attribute row through the last in one motion, or tap rows individually;
2. **meaning:** left = weaker for this Overall level, center = typical, right = stronger.

### 9.3 Animation sequence

Recommended animation:

1. show all rows in a neutral/default visual state;
2. show the Overall reference statement, e.g. “Compared with a typical Overall 7 player”;
3. animate a fingertip starting on the first row;
4. move the fingertip downward in a clear zig-zag;
5. each crossed row snaps visibly;
6. the selected value briefly enlarges/pulses;
7. the compact radar forms live as rows are chosen;
8. finish with a concise line:
   > Swipe through all six — or tap any row to adjust.

Optional interactive ending:

> **Try it**

A sample player can let the user perform one practice gesture before returning to the real player.

### 9.4 Game-like, not gamified

The onboarding may feel playful and tactile, but avoid:

- points;
- scores;
- confetti;
- achievements;
- exaggerated “Great job!!!” language.

The goal is to teach an unusual input quickly, not gamify player evaluation.

### 9.5 Replay and persistence

Rules:

- auto-show once;
- provide immediate Skip;
- never auto-show repeatedly after dismissal/completion;
- `?` always replays the demonstration;
- onboarding completion state can be a lightweight UI preference; no new cloud architecture should be created solely for this flag.

### 9.6 Reduced motion

Respect reduced-motion accessibility settings. Replace animated travel with a short step-by-step/static demonstration while preserving the same information.

---

## 10. Post-rating Detailed card

A saved Detailed profile may show:

- Overall Skill prominently;
- radar with exact stored attribute values;
- subtle Overall baseline;
- attribute labels/values;
- optional Special Role;
- built-in-sport Playing Profile text where applicable;
- edit action.

The card must remain content-driven and not reserve empty sections.

---

## 11. Playing Profile — derived presentation only

For built-in sports, Stripes may derive 1 or at most 2 concise Playing Profile descriptions from the reviewed attribute shape.

Rules:

- derived only; organizer does not rate/select the label;
- presentation only; never feed the label back into optimization;
- recomputable rather than core persistent truth;
- relative attribute shape matters more than absolute level, so Overall-4 and Overall-9 players can share the same style description;
- broad overlapping descriptions are preferred to rigid football positions;
- if nothing stands out, use “All-rounder” or show nothing;
- text only; no required archetype icons;
- Custom Sport/Game has no Playing Profile in v1.

Candidate Football vocabulary remains design material, not a hard-coded final list:

- Defensive anchor
- Ball-winning defender
- Defensive runner
- Deep-lying creator
- Box-to-box player
- Two-way midfielder
- Attacking creator
- Direct attacker
- Finisher
- Wide runner
- Technical attacker
- Pressing attacker
- Possession player
- Pace threat
- All-rounder

---

## 12. Balance Priorities replaces Field Size

### 12.1 Remove Field Size as a normal team-generation control

The old Football Field Size control is an indirect proxy for attribute importance and does not generalize to other sports/games.

Replace it with a session-only **Balance Priorities** control/modal.

### 12.2 Default

Default = **Balanced**.

All active sport attributes receive equal composition attention unless the organizer deliberately selects a priority.

### 12.3 Modal content

The modal is populated from the active Sport Definition’s attributes.

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

Do not expose permanent Low/Medium/High weights or an algorithm tuning panel.

The exact maximum number of simultaneous priorities is not yet locked. Prototype whether allowing one or two focused attributes is clearer than allowing arbitrary many. Selecting most attributes should not become a meaningless pseudo-priority state.

### 12.4 Same session signal for Generate and Live Split

Balance Priorities must feed the same structured evaluator used by both modes.

Generate uses it while searching for the best full arrangement.

Live Split uses it while:

- ranking next-player suggestions;
- matching a round anchor;
- protecting future completion quality;
- placing late arrivals;
- proposing minimal corrections.

Overall fairness remains the dominant guardrail. A priority should not secretly turn a lower-Overall player into a dramatically stronger player.

### 12.5 No generic Field Size concept

The generic multi-sport core must not require Field Size.

If a built-in sport later needs another genuine session context control, Sport Definition may define it explicitly. Board games and Custom Sport/Game need no meaningless sports-field UI.

---

## 13. Multi-sport Sport Definition direction

### 13.1 Generic core

The generic team evaluator should understand concepts such as:

- players;
- Overall Skill;
- attribute vectors;
- equal/default composition treatment;
- optional Special Role;
- hard constraints;
- team-size policy;
- candidate arrangements;
- structured evaluation;
- manual locks/partial assignment for Live Split.

It should not fundamentally understand Football-specific words like Passing, Defense, GK, field size, basketball positions, or board-game strategy semantics.

### 13.2 Built-in sports

A built-in Sport Definition may provide:

- 3 or 6 named attributes;
- optional one Special Role concept;
- optional sport-specific session controls when genuinely useful;
- Playing Profile/archetype definitions;
- tuned explanatory language.

### 13.3 Custom Sport/Game

Creation should stay deliberately small:

1. sport/game name;
2. choose 3 or 6 attributes;
3. name attributes;
4. optionally define one Special Role;
5. create roster.

Custom v1 does **not** include:

- permanent per-attribute weights;
- built-in contexts;
- Playing Profile/archetypes;
- Team Play multiplier;
- trait pile.

Attributes are treated equally by default for composition. Balance Priorities can temporarily emphasize the active custom attributes for a session.

### 13.4 Schema stability

Once a roster/profile is created, its structural attribute schema must not be casually reinterpreted.

Preserve stable attribute IDs separately from labels and version built-in schemas.

Structural changes should use explicit migration/duplication/new-profile semantics rather than silently changing historical data meaning.

---

## 14. Shared evaluator / Best Completion Engine

Generate and Live Split should eventually be two interfaces over the same structured completion/evaluation foundation.

Conceptual evaluation hierarchy:

1. Overall fairness;
2. hard/structural requirements such as team size, Special Role coverage, explicit pairing constraints and other approved rules;
3. attribute composition;
4. temporary Balance Priorities/session context.

Attribute composition should normally not be allowed to destroy Overall fairness.

The evaluator must return machine-readable metrics suitable for:

- Generate;
- Live Split;
- team comparison;
- constrained swaps;
- late-arrival placement;
- no-show repair;
- “Why these teams?” explanations;
- future AI translation of natural-language requests into structured constraints/priorities.

---

## 15. Live Split — approved behavioral direction

### 15.1 Purpose

Live Split exists for real organizer conditions where RSVPs do not equal who is physically present and pre-generated teams can become obsolete through no-shows/late arrivals.

Generate remains useful when the actual participant set is known.

Live Split is for uncertain/changing attendance or organizers who prefer to form teams manually with algorithmic assistance.

### 15.2 Continuous team cursor

For N teams, show a highly visible current destination, e.g.:

> TAP A PLAYER FOR BLUE

After a player is tapped, the destination advances round-robin:

Blue -> Red -> Green -> Blue ...

Skip full teams automatically according to team-size policy.

The normal interaction should **not** be player -> destination picker for every assignment.

### 15.3 Assignment confirms presence

Expected/Today/Meetup players may begin in an unassigned pool.

Tapping a player into a team effectively confirms that they are present.

Untapped expected players can remain unassigned/late/absent without requiring a separate attendance-cleanup ceremony.

### 15.4 Round anchor + suggestions

The first manually chosen player in a color loop/round acts as a temporary anchor.

Example with four teams:

- Blue next;
- organizer taps Anna;
- Stripes can highlight recommended counterparts for Red, Green, Yellow.

Suggestions appear directly in the unassigned pool rather than in blocking dialogs.

If the organizer ignores a suggestion and taps someone else, accept reality immediately and recalculate.

Core rule:

> **Organizer defines reality; algorithm continuously adapts.**

### 15.5 Future-aware, not greedy-only

Recommendations must consider the full remaining pool, not merely the locally best next player.

The engine must protect the quality/feasibility of the eventual completion so it does not consume all useful balancing players early and leave an impossible final round.

As the pool shrinks, future feasibility becomes increasingly important.

### 15.6 Undo

Live Split needs a prominent persistent Undo.

Undo should restore:

- the last assignment;
- team cursor;
- anchor/round state;
- recommendation state.

Repeated Undo should be possible.

### 15.7 Corrections

Manual correction remains secondary but available. Avoid long-press drag as a required mobile mechanic.

### 15.8 Late arrival

When a player arrives late:

- add/activate the player;
- suggest the best team fit under current locked assignments;
- prefer a small placement/correction over regenerating all teams;
- if needed, propose the smallest swap that materially improves fairness.

### 15.9 No-show/removal

If an already-assigned player is removed:

- preserve the rest of the manual reality;
- reevaluate;
- suggest the smallest useful correction rather than rebuilding everything.

### 15.10 Balance feedback

Keep feedback human-readable and restrained. Do not expose raw optimizer scores by default.

If the remaining pool becomes difficult to complete fairly, use concise language such as:

> Remaining players are becoming harder to balance.

Then provide the smallest useful correction/suggestion.

### 15.11 Mobile constraints

Live Split must be designed for:

- one-handed outdoor use;
- bright sunlight;
- 20-30+ player pools;
- large touch targets;
- clearly visible current destination while scrolling;
- color accessibility;
- 2, 3, 4+ teams;
- uneven team sizes when mathematically unavoidable.

Exact layout remains a dedicated UX prototype task before implementation.

---

## 16. AI trust boundary for future team-generation assistance

AI may interpret natural-language organizer intent, but the deterministic/structured evaluator remains authoritative.

Required trust pattern:

1. AI translates the request into visible structured settings/constraints;
2. Stripes shows the organizer what was interpreted;
3. deterministic evaluator/generator acts;
4. explanation is grounded in actual metrics.

Example:

> “Blue looks too weak defensively.”

should become a visible Defense priority or constrained swap search, followed by an explanation of the actual effect.

AI must not invent attributes absent from the active Sport Definition.

---

## 17. Current-generator migration/audit implications

The current Football generator contains several heuristics that T1 should make explicit or retire rather than silently carry forward. The exact baseline below is important for regression tests and migration review.

### 17.1 Current displayed/saved Overall formula

`calculateOverall` currently weights effective attributes approximately as:

- Attack: 0.22
- Defense: 0.22
- Passing: 0.20
- Speed: 0.20
- Stamina: 0.12
- Physical: 0.04

Then Team Play multiplies the result:

- Team Play 1 -> 0.93
- Team Play 2 -> 1.00
- Team Play 3 -> 1.07

Trait effects can modify effective attributes before the weighted calculation. The current dedicated special-ability bonus returns zero, but trait attribute boosts still matter. Overall is rounded to 0.1 and capped at 10.

This displayed/saved Overall is **not** the same score currently used by the team generator. T1 must eliminate that trust gap.

### 17.2 Current field-size generation weighted skill

`getWeightedSkill(player, fieldSize)` currently uses five attributes and omits Physical entirely.

Small field:

- Attack 0.22
- Passing 0.26
- Defense 0.22
- Speed 0.15
- Stamina 0.15

Medium field:

- Attack 0.20
- Passing 0.20
- Defense 0.20
- Speed 0.20
- Stamina 0.20

Large field:

- Attack 0.16
- Passing 0.18
- Defense 0.20
- Speed 0.22
- Stamina 0.24

`getBalanceSkill` then multiplies that weighted skill by **0.35** for `todayStatus === "not_here_yet"`; otherwise the multiplier is 1.

This is the concrete legacy behavior being replaced when Field Size gives way to explicit session Balance Priorities. Do not silently preserve these permanent field-size weight matrices under a new name.

### 17.3 Current generation passes

Current generation is greedy and assigns toward the team with the lowest current total skill. Present players are split into special pre-pass groups:

1. females, sorted by weighted skill;
2. non-female `runners`, currently `speed >= 7`;
3. remaining present players;
4. `not_here_yet` players last.

The first two passes distribute up to one player per team before the remaining pool is greedily assigned. Late/not-here-yet players are then distributed using late-count and total-skill logic.

The future generic engine must not carry forward female-bucket or `speed >= 7` runner semantics automatically. Gender/composition treatment is still a separate product decision.

### 17.4 Current pairing post-processing

Pairing evaluation currently includes large penalties such as:

- separate-rule violation: +10000
- together-rule violation: +4000
- team-size spread: `(maxSize - minSize) * 80`
- total-skill spread: `(maxTotal - minTotal) * 8`

The improvement step only performs cross-team player-for-player swaps, for a limited number of passes. Because swaps preserve team counts, the size-spread penalty cannot itself repair a size difference.

T1 should replace this with explicit team-size policy + structured hard/soft constraints rather than assume the old cleanup loop is a generic optimizer.

### 17.5 Current trait effects

Current traits can add effective-stat boosts, capped by the existing effect logic. Examples include Finisher -> Attack, Playmaker -> Passing, Engine -> Stamina/Speed, Sentinel -> Defense, and other multi-stat boosts. GK intentionally provides no stat boost.

These effects contribute to the current hidden coupling between displayed attributes, Overall and generation. T1’s future core should not keep this large trait pile as algorithmic inputs.

### 17.6 Current GK and team-stat behavior

GK currently appears as a player/team badge and in export presentation, but it does **not** affect generator allocation. T1 Special Role should make genuine role coverage explicit and machine-readable.

Current team-stat rows show Attack, Passing, Defense, Speed and Stamina. Physical is omitted.

### 17.7 Local/shared inconsistency

Current local-player conversion passes the trait flags into team generation. Current shared/club-balance conversion carries GK but largely drops the other traits and normalizes Team Play. This means local and shared rosters can be balanced using materially different player information.

T1 should solve the inconsistency by simplifying the authoritative profile model, not by blindly copying every legacy trait into shared storage.

### 17.8 Regression-test implication

Targeted generator regression coverage is currently weak. Before major replacement, add focused scenarios for:

- Overall fairness;
- 2/3/4+ teams;
- uneven player counts;
- pairing constraints;
- late/not-here-yet behavior;
- GK/Special Role migration behavior;
- local/shared consistency;
- legacy roster compatibility.

T1 should not “generalize” current heuristics by renaming them. It should replace them with explicit Overall, attribute composition, Special Role, constraints and structured evaluation concepts.

---

## 18. Acceptance criteria for the Detailed Profile UX

A future implementation is not complete until all of the following are true.

### Data truth

- Overall can exist alone and is fully valid.
- Opening Detailed Profile does not fabricate/persist six ratings.
- Saving Detailed Profile stores explicit attribute values.
- Radar plots those exact stored values.
- Generate/Live Split evaluator receives those same explicit values.
- Editing one attribute does not silently change unrelated attributes or Overall.
- Editing Overall does not silently rewrite reviewed attributes.

### Mobile input

- user can create a six-attribute profile with one continuous downward zig-zag gesture;
- each row has clear snap behavior;
- tap-only input works equally well;
- user can correct one row without repeating the whole gesture;
- finger does not obscure the only visible feedback;
- page scrolling does not routinely steal the profile gesture;
- the component works on real Android devices, not just desktop emulation.

### Visual verification

- compact radar updates live during selection;
- saved radar matches numeric attribute values;
- Overall reference baseline is visibly secondary;
- Basic profile does not show a fake/empty radar as a nag.

### Help/onboarding

- first-use animation clearly demonstrates the zig-zag gesture;
- it also teaches weaker/typical/stronger relative-to-Overall meaning;
- Skip is available;
- onboarding does not repeat automatically after completion/dismissal;
- `?` replays it at any time;
- reduced-motion alternative exists.

### Accessibility

- rows are operable without swipe;
- keyboard/pointer/tap alternatives exist where applicable;
- accessible names expose attribute + selected meaning/value;
- selection is not color-only;
- minimum touch target guidance is respected;
- haptics are optional enhancement only.

### Multi-sport

- component renders from Sport Definition attributes;
- 3-attribute custom profiles work without Football assumptions;
- 6-attribute built-in profiles work;
- Custom Sport/Game omits Playing Profile cleanly;
- absent Special Role/Playing Profile sections do not reserve blank card space.

---

## 19. Open implementation questions — do not silently decide during coding

The direction above is locked, but the following details still require prototype/testing decisions:

1. Exact numeric mapping of the five relative snap positions, especially near Overall 1/10 boundaries.
2. Whether first T1 release needs half-step fine adjustment or whether five stable values are more accurate in practice.
3. Whether Detailed Profile requires all attributes to be explicitly reviewed, or supports an explicit per-attribute “unknown/not sure” state. Do not infer a product decision from untouched UI state.
4. Exact maximum number of simultaneous Balance Priorities; test one/two versus unrestricted selection.
5. Exact mobile layout/size of the compact live radar relative to the six input rows.
6. Whether the onboarding ends with a practice interaction or animation-only demonstration.
7. Exact Playing Profile vocabulary/thresholds for Football.
8. Exact Best Completion search technique/performance strategy.
9. Gender/composition treatment in the generic T1 engine remains a separate product decision; do not carry the current hard-coded behavior forward automatically.
10. Final migration plan for existing Football attributes, Team Play and legacy traits.

These are legitimate stop points if implementation reaches them before a product decision is recorded.

---

## 20. Implementation sequencing guardrail

This document is a design checkpoint only.

Do not start T1 implementation merely because this specification exists. Current roadmap phase order and security-sensitive Google/G2 work remain authoritative until explicitly reprioritized.

Before T1 algorithm replacement:

1. add regression scenarios around the current generator;
2. define/version Sport Definition and player-profile persistence semantics;
3. prototype the Detailed Profile mobile interaction on a real phone;
4. validate the one-swipe gesture and boundary mapping;
5. define structured evaluator metrics;
6. then implement Generate/Live Split against the shared evaluator in small atomic phases.

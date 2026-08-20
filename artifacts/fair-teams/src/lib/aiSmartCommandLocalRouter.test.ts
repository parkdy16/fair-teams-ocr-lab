import assert from "node:assert/strict";
import test from "node:test";
import { parseFairTeamsLocalSmartCommand } from "./aiSmartCommandLocalRouter.ts";
import {
  AI_SMART_COMMAND_CAPABILITIES,
  aiCommandCapabilityLabel,
} from "./aiSmartCommandCapabilities.ts";
import {
  bulkRosterSelectionExcludedText,
  isUseExistingPlayerAction,
  USE_EXISTING_PLAYER_DISTRIBUTION,
} from "./aiSmartCommandActionSemantics.ts";
import type { AiSmartCommandRosterPlayer } from "./aiSmartCommandTypes.ts";
import { createAiSmartCommandConversationPresenter } from "../i18n/aiSmartCommandConversation.ts";
import type { StripesTranslator } from "../i18n/i18n.ts";

const roster: AiSmartCommandRosterPlayer[] = [
  { id: "george", name: "George", skill: 8, speed: 9, attending: true },
  { id: "sarah", name: "Sarah", skill: 6, speed: 7, attending: true },
  { id: "tommy", name: "Tommy", skill: 4, speed: 5, attending: true },
];

test("local navigation keeps deterministic assistant English and action metadata", () => {
  const response = parseFairTeamsLocalSmartCommand("open Club", roster);

  assert.ok(response);
  assert.equal(response.detectedLanguage, "en");
  assert.equal(response.assistantSummary, "I can open Club for you.");
  assert.equal(response.actions[0]?.capabilityId, "navigation.open_area");
  assert.equal(response.actions[0]?.targetArea, "Club");
  assert.equal(response.actions[0]?.reason, "Open the Club area.");
});

test("local team-generation validation keeps interpolated English", () => {
  const insufficient = parseFairTeamsLocalSmartCommand("make 2v2 teams", roster);
  assert.ok(insufficient);
  assert.equal(
    insufficient.assistantSummary,
    "2v2 needs at least 4 selected players, but Session has 3. Add more players or ask for a different team setup.",
  );
  assert.equal(insufficient.unresolved[0]?.message, "2v2 needs 4 players.");

  const invalid = parseFairTeamsLocalSmartCommand("make 4 teams", roster);
  assert.ok(invalid);
  assert.equal(
    invalid.assistantSummary,
    "I can’t make 4 teams from 3 selected players. Choose fewer teams or select more players.",
  );
  assert.equal(invalid.unresolved[0]?.message, "The selected player count does not fit that team count.");
});

test("local roster and knowledge answers remain exact canonical English", () => {
  const fastest = parseFairTeamsLocalSmartCommand("who is fastest?", roster);
  assert.ok(fastest);
  assert.equal(fastest.assistantSummary, "By speed, George is highest at 9. Next: Sarah (7), Tommy (5).");

  const knowledge = parseFairTeamsLocalSmartCommand("How does Action Board work?", roster);
  assert.ok(knowledge);
  assert.equal(
    knowledge.assistantSummary,
    "Action Board is the Club workspace for things chat handles poorly: durable topics, decisions, ownership, and follow-through. A topic can move through Ideas, Decide, Action, and Done while keeping its history. Organizers can run anonymous votes, record decisions, find a meeting time, choose players or equipment, assign one or more people to an action, add due dates and links, and mark work complete. The Bell sends a deliberate one-time organizer email for the current step; Stripes does not send automatic activity spam. Action Board is not meant to replace Signal or other group chat.",
  );

  const goalkeepers = parseFairTeamsLocalSmartCommand(
    "who are the goalkeepers?",
    roster.map((player) => ({ ...player, isGoalkeeper: true })),
  );
  assert.ok(goalkeepers);
  assert.equal(goalkeepers.assistantSummary, "Goalkeepers in this roster: George, Sarah, Tommy.");
});

test("local new-player output preserves user-entered names", () => {
  const response = parseFairTeamsLocalSmartCommand("add Raphael as new player", roster);

  assert.ok(response);
  assert.equal(
    response.assistantSummary,
    "I understood this as a new-player request: Raphael. I will not silently merge a new-player request into an existing roster name.",
  );
  assert.equal(response.actions[0]?.newPlayerName, "Raphael");
  assert.equal(response.actions[0]?.reason, "Add Raphael as a new roster player, then mark them present for Session.");
});

test("UI presentation and local assistant conversation use independent translators", () => {
  const futureUiPresenter = ((key: string) => `UI-DE:${key}`) as StripesTranslator;
  assert.equal(
    aiCommandCapabilityLabel(AI_SMART_COMMAND_CAPABILITIES[0], futureUiPresenter),
    "UI-DE:ai.capability.todaySelectPlayers.label",
  );

  const canonical = parseFairTeamsLocalSmartCommand("open Club", roster);
  assert.ok(canonical);
  assert.equal(canonical.assistantSummary, "I can open Club for you.");
  assert.equal(canonical.actions[0]?.reason, "Open the Club area.");

  let suppliedTranslationLocale: unknown = null;
  const suppliedTranslator = ((key: string, values?: Record<string, unknown>) => {
    suppliedTranslationLocale = values?.lng;
    if (key === "ai.area.club") return "Conversation Club";
    if (key === "ai.local.navigation.intent") return `INTENT:${values?.area}`;
    if (key === "ai.local.navigation.openSummary") return `SUMMARY:${values?.area}`;
    if (key === "ai.local.reason.openArea") return `REASON:${values?.area}`;
    return `CONVERSATION:${key}`;
  }) as StripesTranslator;
  const suppliedConversation = createAiSmartCommandConversationPresenter(
    suppliedTranslator,
    "de-DE",
  );
  assert.equal(
    suppliedConversation.formatList(["Raphael", "Min-Jun"], { type: "conjunction" }),
    "Raphael und Min-Jun",
  );
  assert.equal(suppliedConversation.formatNumber(1234.5), "1.234,5");
  const supplied = parseFairTeamsLocalSmartCommand(
    "open Club",
    roster,
    undefined,
    suppliedConversation,
  );

  assert.ok(supplied);
  assert.equal(supplied.normalizedIntent, "INTENT:Conversation Club");
  assert.equal(supplied.assistantSummary, "SUMMARY:Conversation Club");
  assert.equal(supplied.actions[0]?.reason, "REASON:Conversation Club");
  assert.equal(suppliedTranslationLocale, "de-DE");
});

test("explicit conversation presenter preserves user names and formats its own lists", () => {
  const suppliedTranslator = ((key: string, values?: Record<string, unknown>) => {
    if (key === "ai.local.reason.addMissingPlayer") return "ADD";
    if (key === "ai.local.reason.addNamedPlayer") return `ADD:${values?.name}`;
    if (key === "ai.local.newPlayer.summary") return `SUMMARY:${values?.names}`;
    return "";
  }) as StripesTranslator;
  const suppliedConversation = createAiSmartCommandConversationPresenter(
    suppliedTranslator,
    "en",
  );
  const response = parseFairTeamsLocalSmartCommand(
    "add Raphael and Min-Jun as new player",
    roster,
    undefined,
    suppliedConversation,
  );

  assert.ok(response);
  assert.equal(response.assistantSummary, "SUMMARY:Raphael, Min-Jun");
  assert.deepEqual(
    response.actions.map((action) => action.newPlayerName).filter(Boolean),
    ["Raphael", "Min-Jun"],
  );
  assert.deepEqual(
    response.actions.map((action) => action.reason).filter(Boolean),
    ["ADD:Raphael", "ADD:Min-Jun"],
  );
});

test("local new-player possible matches use complete localized items and preserve names", () => {
  const duplicate = parseFairTeamsLocalSmartCommand("add George and Sarah as new player", roster);

  assert.ok(duplicate);
  assert.equal(
    duplicate.assistantSummary,
    "I understood this as a new-player request: George, Sarah. I also found possible existing matches: George is already close to George, Sarah is already close to Sarah. I will not silently merge a new-player request into an existing roster name.",
  );

  const similar = parseFairTeamsLocalSmartCommand("add Sarha as a new player", roster);

  assert.ok(similar);
  assert.equal(
    similar.assistantSummary,
    "I understood this as a new-player request: Sarha. I also found possible existing match: Sarha ↔ Sarah. I will not silently merge a new-player request into an existing roster name.",
  );
  assert.equal(similar.confirmations[0]?.playerRefs?.[0]?.rosterName, "Sarah");
  assert.equal(similar.confirmations[0]?.playerRefs?.[0]?.spokenName, "Sarha");
});

test("use-existing-player presentation is identified without translated reason text", () => {
  const response = parseFairTeamsLocalSmartCommand("add Sarha as a new player", roster);
  const useExistingAction = response.actions.find((action) => action.distribution === USE_EXISTING_PLAYER_DISTRIBUTION);

  assert.ok(useExistingAction);
  assert.equal(isUseExistingPlayerAction({
    ...useExistingAction,
    reason: "Möglicher vorhandener Spieler aus dem Kaderabgleich.",
  }), true);
  assert.equal(isUseExistingPlayerAction({
    ...useExistingAction,
    distribution: "add_today_selection",
    reason: "Possible existing match from a legacy provider.",
  }), true);
});

test("bulk all-except presentation prefers structured data and limits legacy text parsing", () => {
  const response = parseFairTeamsLocalSmartCommand("add Sarha as a new player", roster);
  const template = response.actions.find((action) => action.distribution === USE_EXISTING_PLAYER_DISTRIBUTION);
  assert.ok(template);

  assert.equal(bulkRosterSelectionExcludedText({
    ...template,
    distribution: "replace_today_selection:bulk_all_except:local_fast",
    targetName: "George, Sarah",
    reason: "Lokalisierter Begründungstext ohne englischen Marker.",
  }), "George, Sarah");
  assert.equal(bulkRosterSelectionExcludedText({
    ...template,
    distribution: "replace_today_selection:bulk_all_except",
    targetName: null,
    reason: "Select 1 of 3 roster players, excluding George and Sarah.",
  }), "George and Sarah");
  assert.equal(bulkRosterSelectionExcludedText({
    ...template,
    distribution: "replace_today_selection:bulk_all_roster",
    targetName: "George",
    reason: "Select every player, excluding George.",
  }), "");
});

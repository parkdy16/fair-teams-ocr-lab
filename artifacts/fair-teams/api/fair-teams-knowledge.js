export const FAIR_TEAMS_KNOWLEDGE_VERSION = "2026-06-21.roster-stat-answer-v1";

function clean(value, max = 4000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalize(value) {
  return clean(value, 4000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const KNOWLEDGE_SECTIONS = {
  core: {
    title: "Fair Teams core model",
    keywords: ["fair teams", "app", "what can you do", "how does this work", "help"],
    text: `Fair Teams is a casual football organizer app. The core workflow is: keep a roster of known players, mark who is playing today, then generate balanced teams. The assistant should sound like a helpful organizer, not a developer changelog. For product questions, answer from the user's perspective: what the feature is for, when to use it, and what to expect. Keep answers friendly, plain, and practical. Avoid technical implementation wording, beta/wiring comments, schemas, APIs, and internal project language unless the user explicitly asks about development.`,
  },
  localSharedRosters: {
    title: "Local/private rosters vs shared rosters",
    keywords: ["local", "private", "non shared", "non-shared", "shared roster", "cloud", "club roster", "make private copy", "duplicate to private"],
    text: `A local/private roster belongs to the device/user and uses the normal full Fair Teams player profile. Sharing should create a separate shared roster copy, not silently convert the local roster. A shared roster is an online Club roster for multiple organizers. It syncs shared-safe fields and uses Club ratings for team generation. If a user wants their own private version of a shared roster, the intended action is make/duplicate a private copy. Local backups are private backups and should not be treated as collaboration.`,
  },
  rosterCopy: {
    title: "Copying or duplicating rosters",
    keywords: ["copy roster", "copy one roster", "copy a roster", "duplicate roster", "duplicate a roster", "new roster from", "copy to new roster", "clone roster", "same roster", "make private copy", "private copy", "export this roster", "import one roster", "import as new roster", "add as new roster"],
    text: `There are two common roster-copy cases in Fair Teams. For a local/private roster, the safe current workflow is to use Roster Tools > Local Backup > Export this roster, then use Import one roster and choose that exported file. Fair Teams imports it as a separate new roster with a unique name, so the original stays unchanged; the user can rename the copied roster afterward. For a shared roster, use Make private copy. That creates a clean local roster from the shared roster while the shared roster stays online and unchanged. A private copy of a shared roster copies shared names and uses Club averages as starting skill, but photos, special abilities, and private advanced traits are reset so it starts clean. If the user asks for a one-tap duplicate command, explain the safest available path instead of pretending there is a direct duplicate button unless the current UI has one.`,
  },
  visiblePlayerData: {
    title: "Visible player data and roster-stat questions",
    keywords: ["who has", "lowest stamina", "highest stamina", "best defender", "fastest", "strongest", "weakest", "player stats", "visible stats", "attack", "defense", "speed", "passing", "stamina", "engine"],
    text: `When the user asks a roster-data question such as "who has the lowest stamina in my roster?" the assistant should inspect the visible player data it receives and answer with player names and values, not create an action card. In local/private rosters, visible individual player details matter. Use visible values such as skill/OVR, attack, defense, speed, passing, stamina/endurance/fitness if available, and visible special traits such as Engine, Goalkeeper, Playmaker, Finisher, Dribbler, Sentinel, Versatile, Space Finder, or Organizer. If a stat is not actually available to the assistant, say that clearly instead of guessing. For stamina specifically, a numeric stamina/endurance/fitness value is better than the Engine trait; Engine only means high-stamina style, not a complete lowest-stamina ranking.`,
  },
  ratings: {
    title: "Ratings, normal rating, private rating, Club rating",
    keywords: ["rating", "ratings", "skill", "ovr", "normal rating", "non shared rating", "non-shared rating", "private rating", "club rating", "average rating", "consensus", "advanced", "attack", "defense", "passing", "speed"],
    text: `In Fair Teams, a non-shared/local/private roster uses the normal private rating system. That rating belongs to the organizer's private roster and is used directly by team generation. The private/local player profile can include main skill/OVR and, where available, private advanced details like attack, defense, passing, speed, and special traits. A shared/Club roster is different: each organizer submits their own private simple rating for a player. Other organizers do not see individual ratings. Fair Teams averages submitted organizer ratings into a Club average/consensus rating, and shared team generation uses that Club average. A collaborator should normally see a Club average only after submitting their own rating for that player, to avoid bias. Organizers can skip players they do not know and rate them later. If the user asks about "non-shared roster rating vs normal rating", explain that those are effectively the same if they mean local/private roster rating; the real difference is local/private rating versus shared/Club average rating.`,
  },

  playerQueries: {
    title: "Natural roster/player queries",
    keywords: ["top players", "strongest", "weakest", "best defenders", "fastest", "best passers", "highest rated", "lowest rated", "use 10 players", "pick players from roster"],
    text: `Fair Teams should understand natural player-pool requests using visible player data. Visible player variables include name/AKA, skill/OVR, attack, defense, speed, passing, special traits such as goalkeeper/playmaker/finisher/dribbler/sentinel/engine/versatile/space finder, gender/category, vibe/fun badge, and attending status. Examples: "make teams with the 10 strongest players" means select the top 10 by skill/OVR from the roster first, then generate teams. "weakest 8" means sort by skill/OVR ascending. "fastest" uses speed, "best defenders" uses defense, "best attackers" uses attack, and "best passers/playmakers" uses passing. If a request is vague, the assistant should ask a friendly clarifying question rather than guessing.`,
  },
  todayTeams: {
    title: "Today tab and team generation",
    keywords: ["today", "attendance", "playing today", "select players", "make teams", "generate teams", "5v5", "6v6", "teams", "team count", "players per team", "present teams"],
    text: `The Today tab is where the organizer marks who is playing now. Commands like "Joon, Jorge and Sarah are playing today" mean select those people for Today. "5v5" means five players per team and normally needs 10 selected players. "Make 6 teams" means six total teams, not 6v6. The AI should set up intent and warnings; the existing Fair Teams generator creates final teams. If not enough players are selected for a requested format, the assistant should explain the mismatch and suggest adding/selecting more players or changing the team size.`,
  },
  pairingLocks: {
    title: "Pairing rules and team locks",
    keywords: ["pair", "pairing", "together", "separate", "don't like", "dont like", "same team", "red team", "blue team", "wearing red", "lock", "team color"],
    text: `Pairing rules are roster/team-generation instructions. "Sarah and Tommy don't like each other", "not together", or similar means keep separate. "Sarah and Tommy came together" or "keep them together" means keep together. Team locks place a player into a specific team/color when generating teams, such as "George red" or "put George in red". These are setup instructions for the generator, not manually invented final teams.`,
  },
  smartImport: {
    title: "Screenshot Smart Import, OCR, crop boxes, Lost & Found",
    keywords: ["ocr", "smart import", "screenshot", "scan", "better scan", "crop", "lost and found", "meetup", "other screenshot", "review names", "word chip", "cloud vision"],
    text: `Screenshot Smart Import reads names from screenshots so organizers do not have to type attendance manually. The current default is offline OCR and it should remain the default. The crop workflow supports one-list and two-list boxes, moving/resizing crop areas, Meetup and Other screenshot modes, Review Names UI, OCR report export, and Lost & Found rescue. Lost & Found is meant to help rescue names missed by OCR. AI/Cloud OCR should be optional and gated, not required for the normal offline flow.`,
  },
  clubNotes: {
    title: "Club tab and Club Notes",
    keywords: ["club", "club notes", "notes", "post it", "post-it", "organizer note", "community", "shared note"],
    text: `The Club tab is the organizer/community space. Club Notes are friendly post-it style notes for organizers, such as "Puma ball died today — Joon". Adding a note is non-destructive and can be an executable AI action when the current shared roster/account state supports it. Deleting notes is more sensitive and should require confirmation.`,
  },
  equipment: {
    title: "Equipment Board",
    keywords: ["equipment", "bag", "bags", "ball", "bibs", "cones", "pump", "holder", "who has", "move bag", "gear"],
    text: `The Equipment Board is a simple 'who has what?' board for a football group. It tracks bags/items such as balls, bibs, cones, pumps, jerseys, or any group gear that someone might take home after a match. It helps organizers quickly see who currently has each item before the next game, instead of checking old chats or asking everyone again. Commands like "move the bibs bag to Sarah" or "George has the cones now" mean move/change the holder of an equipment item. For normal product questions, explain the user benefit and do not mention beta branches, wiring, implementation status, or technical limitations. Only mention that Equipment Board changes cannot be applied from chat yet when the user specifically asks the assistant to move/change equipment.`,
  },
  backupSync: {
    title: "Cloud Backup vs Shared Roster",
    keywords: ["backup", "cloud backup", "restore", "google drive", "sync", "collaboration", "collaborator", "organizer", "invite", "firebase", "save online", "get latest", "shared roster backup"],
    text: `Cloud Backup and Shared Roster sound similar, but they solve different user problems. Cloud Backup is your private safety copy: use it when you want to save your rosters and restore them later on your own device/account. It is not for collaboration and should not be presented as a way for friends or co-organizers to edit the same roster. Shared Roster is the collaboration mode: use it when multiple organizers need access to the same online roster, shared player identity fields, Club ratings, Club Notes, Equipment, and organizer tools. Shared rosters sync shared-safe data; private things such as local photos and device preferences should stay private. User-facing comparison: use Cloud Backup when you want insurance; use Shared Roster when another organizer needs to work with you.`,
  },
  voiceAi: {
    title: "AI assistant and voice design",
    keywords: ["ai", "assistant", "voice", "talk", "speak", "microphone", "transcribe", "ask fair teams"],
    text: `The AI assistant should feel conversational but remain focused on Fair Teams. It can answer simple app questions and interpret commands. The safest first voice design is push-to-talk or tap-to-record: record audio, transcribe it, show the transcript, then pass the text to the same assistant/action system. If asked about future/live voice, explain the intended user experience simply. Avoid exposing developer terms unless the user asks about implementation. AI actions should still be controlled by safe app handlers and confirmations.`,
  },
  privacySafety: {
    title: "Safety, confirmation, and limits",
    keywords: ["delete", "remove", "safe", "confirmation", "privacy", "can you do", "not wired", "why can't"],
    text: `Safe simple actions can be applied or one-tap applied. Risky actions require confirmation. Destructive actions such as deleting players, rosters, backups, notes, or collaborator access must never happen automatically from one casual sentence. For feature explanations, keep the answer user-facing and do not mention implementation status. For action requests that cannot currently be applied from chat, say plainly: 'I understand what you want, but I cannot change that from chat yet.' If the knowledge base does not contain a Fair Teams detail, say the assistant does not have that Fair Teams detail yet rather than guessing.`,
  },
};

function matchScore(section, normalizedText) {
  let score = 0;
  for (const keyword of section.keywords || []) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword && normalizedText.includes(normalizedKeyword)) score += normalizedKeyword.length > 8 ? 3 : 2;
  }
  return score;
}



const APP_QUESTION_WORDS = [
  "what", "whats", "what's", "how", "why", "when", "where", "difference", "different", "explain", "meaning", "mean", "does", "do", "can i", "can you", "should i", "is", "are", "was", "werden", "wie", "was", "warum", "unterschied", "erklar", "erklär", "무엇", "뭐", "차이", "어떻게", "왜", "설명", "의미"
];

const APP_FEATURE_WORDS = [
  "fair teams", "roster", "copy roster", "duplicate roster", "new roster", "make private copy", "export this roster", "import one roster", "local roster", "shared roster", "private roster", "non shared", "non-shared", "rating", "ratings", "skill", "ovr", "club rating", "club average", "normal rating", "local rating", "shared rating", "top players", "strongest", "weakest", "fastest", "best defenders", "best attackers", "best passers", "today", "teams", "5v5", "6v6", "players per team", "team count", "pairing", "keep together", "keep separate", "club", "club notes", "equipment", "equipment board", "bag", "smart import", "ocr", "lost and found", "screenshot", "crop", "review names", "cloud backup", "backup", "shared", "firebase", "voice", "assistant"
];

const ACTION_REQUEST_STARTERS = [
  "add ", "create ", "make ", "select ", "unselect ", "move ", "give ", "put ", "set ", "change ", "rename ", "delete ", "remove ", "open ", "generate ", "lock ",
  "can you add", "can you move", "can you select", "can you make", "please add", "please move", "bitte", "추가", "이동", "선택", "만들"
];

function hasAnyNormalized(normalizedText, words) {
  return words.some((word) => {
    const normalizedWord = normalize(word);
    return normalizedWord && normalizedText.includes(normalizedWord);
  });
}

function startsLikeActionRequest(normalizedText) {
  return ACTION_REQUEST_STARTERS.some((starter) => normalizedText.startsWith(normalize(starter)));
}

function looksLikeFairTeamsQuestion(commandText = "") {
  const normalizedText = normalize(commandText);
  if (!normalizedText) return false;
  const hasQuestionShape = commandText.includes("?") || hasAnyNormalized(normalizedText, APP_QUESTION_WORDS);
  const hasAppFeature = hasAnyNormalized(normalizedText, APP_FEATURE_WORDS);
  if (!hasQuestionShape || !hasAppFeature) return false;
  // "Can you add/move/select..." is an app command, not a product Q&A question.
  if (startsLikeActionRequest(normalizedText) && !/(what|how|why|difference|explain|meaning|mean|unterschied|차이|설명)/i.test(commandText)) return false;
  return true;
}

function scoreTopic(section, normalizedText) {
  let score = matchScore(section, normalizedText);
  const title = normalize(section.title || "");
  if (title && normalizedText.includes(title)) score += 4;
  return score;
}

function detectKnowledgeTopic(commandText = "") {
  const normalizedText = normalize(commandText);
  const scored = Object.entries(KNOWLEDGE_SECTIONS)
    .map(([id, section]) => ({ id, score: scoreTopic(section, normalizedText) }))
    .sort((a, b) => b.score - a.score);

  const hasRating = /(rating|ratings|skill|ovr|level|ability|bewertung|wertung|실력|등급|평점)/i.test(commandText);
  const hasRosterMode = /(local|private|shared|non.?shared|normal|club|average|consensus|로컬|개인|공유|클럽|평균)/i.test(commandText);
  const asksDifference = /(difference|different|versus| vs |compare|unterschied|차이)/i.test(commandText);
  if (hasRating && (hasRosterMode || asksDifference)) return "ratings";

  if (/(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster).{0,40}roster|roster.{0,40}(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster)/i.test(commandText)) return "rosterCopy";
  if (/(lost.?found|lost and found|ocr|smart import|screenshot|crop|scan|review names|meetup)/i.test(commandText)) return "smartImport";
  if (/(cloud backup|backup|restore|shared roster collaboration|collaboration|sync|google drive)/i.test(commandText)) return "backupSync";
  if (/(who has|lowest|highest|best|worst|fastest|slowest|stamina|endurance|fitness|attack|defense|defence|speed|passing|player stats)/i.test(commandText)) return "visiblePlayerData";
  if (/(equipment|bag|bags|bibs|cones|ball|holder|gear)/i.test(commandText)) return "equipment";
  if (/(club notes|post.?it|organizer note|club tab|club)/i.test(commandText)) return "clubNotes";
  if (/(top players|strongest|weakest|fastest|best defenders|best attackers|best passers|highest rated|lowest rated)/i.test(commandText)) return "playerQueries";
  if (/(today|attendance|playing today|team generation|generate teams|5v5|6v6|teams|team count|players per team)/i.test(commandText)) return "todayTeams";
  if (/(pairing|keep together|keep separate|separate|together|team lock|red team|blue team|color lock)/i.test(commandText)) return "pairingLocks";
  if (/(local roster|private roster|shared roster|co.?organizer|collaborator)/i.test(commandText)) return "localSharedRosters";
  if (/(voice|talk|microphone|transcribe|ai assistant|assistant)/i.test(commandText)) return "voiceAi";

  return scored[0]?.score > 0 ? scored[0].id : null;
}

const DIRECT_FAIR_TEAMS_ANSWERS = {
  ratings: `In Fair Teams, local/private/non-shared rating is the normal private rating system. It belongs to your own roster and is used directly when you generate teams. In a private roster, the player profile can include the main skill/OVR and, where available, private advanced details like attack, defense, passing, speed, and special traits.\n\nShared rating is different. In a shared/Club roster, each organizer submits their own private simple rating for a player. Other organizers do not see that individual rating. Fair Teams combines submitted organizer ratings into a Club average/consensus rating, and shared team generation uses that Club average. A collaborator should normally see the average only after rating that player, so they are not biased.`,
  localSharedRosters: `A local/private roster is your own roster on your device. It uses the normal full Fair Teams workflow and your own private player ratings. A shared roster is an online Club roster for multiple organizers. It syncs shared-safe information such as names, AKA/aliases, category/vibe notes, Club ratings, notes, equipment, and collaboration data. Sharing should create a separate shared copy; it should not silently convert your local roster. If you want your own version of a shared roster, use a private copy.`,
  rosterCopy: `If you want to copy a local roster into a new roster, use the safe backup/import path: open Roster Tools, go to Local Backup, tap Export this roster, then tap Import one roster and choose the file you just exported. Fair Teams adds it as a separate new roster with a unique name, so the original roster stays unchanged. You can rename the copied roster afterward.

If the roster is a shared roster and you want your own local version, use Make private copy instead. That keeps the shared roster online and unchanged, and creates a clean local copy using shared names and Club averages as starting skill. Photos, special abilities, and private advanced traits are reset in that private copy.`,
  smartImport: `Smart Import reads names from screenshots so you do not have to type attendance manually. The default flow uses offline OCR, crop boxes, Meetup/Other screenshot modes, Review Names, OCR report export, and Lost & Found. Lost & Found is there to rescue possible names that OCR did not confidently place in the main name list. AI or cloud OCR should stay optional, not replace the reliable offline default.`,
  playerQueries: `You can ask Fair Teams for player pools in normal language, using the data you can already see on player cards. For example, “make teams with the 10 strongest players” should pick the top 10 by skill/OVR from the roster first, then generate teams. “Fastest players” uses speed, “best defenders” uses defense, “best attackers” uses attack, and “best passers/playmakers” uses passing. If the request is unclear, Fair Teams should ask before changing Today.`,
  todayTeams: `The Today tab is where you select who is playing now. Team generation then uses those selected players to create balanced teams. “5v5” means five players per team, so it normally needs 10 selected players. “Make 6 teams” means six total teams, not 6v6. The assistant should set up selection, size/count, rules, and warnings; the Fair Teams generator still creates the final teams.`,
  pairingLocks: `Pairing rules guide the team generator. “Keep Sarah and Tommy together” means try to place them on the same team. “Sarah and Tommy do not like each other” or “do not put them together” means keep them separate. Team locks are different: “George red” or “put George in red” means lock that player to a specific team/color when teams are generated.`,
  clubNotes: `Club Notes are friendly organizer notes in the Club area, like a shared post-it board. They are meant for quick community/organizer notes such as “Puma ball died today — Joon.” Adding a note is relatively safe; deleting notes should require confirmation.`,
  equipment: `Equipment is like a small “who has what?” board for your football group. Use it for balls, bibs, cones, pumps, jerseys, or any bag/item someone might take home after a match. Before the next game, organizers can quickly see who has each item instead of searching Signal/WhatsApp or asking everyone again. If the roster is shared, it works especially well as a shared organizer board for group gear.`,
  backupSync: `Cloud Backup is your private safety copy. Use it when you want to save your rosters and restore them later on your own device/account. It is not meant for collaboration.

Shared Roster is for working with other organizers. It keeps a shared online roster so co-organizers can use the same player list, shared player info, Club ratings, notes, and equipment tools.

So the simple rule is: use Cloud Backup for personal backup/restore; use Shared Roster when another organizer needs access to the same roster.`,
  voiceAi: `The intended voice design is push-to-talk or tap-to-record first: record speech, transcribe it, show the transcript, then send it to the same Fair Teams assistant/action system. Realtime always-listening voice can come later. The assistant should be conversational, but app changes still go through safe capability handlers and confirmations.`,
  privacySafety: `Fair Teams AI should be helpful but cautious. Simple setup actions can be previewed or applied with one tap. Risky changes need confirmation. Destructive actions like deleting players, rosters, backups, notes, or collaborator access should never happen automatically from one casual sentence.`,
  visiblePlayerData: `I can answer roster-stat questions using the player data Fair Teams gives me, such as skill/OVR, attack, defense, speed, passing, stamina/endurance/fitness if available, and visible special traits. If you ask “who has the lowest stamina?”, I should rank the visible stamina/endurance value if the roster provides one. If I only see the Engine trait and not a separate stamina score, I should say that clearly instead of pretending to know the exact lowest-stamina player.`,
  core: `Fair Teams helps a casual football organizer keep a roster, select who is playing today, and generate balanced teams. The assistant can answer app questions and help turn messy instructions into safe app actions. It should explain features in plain organizer language, not technical implementation language.`
};

export function getDirectFairTeamsAnswerForCommand(commandText, context = {}) {
  if (!looksLikeFairTeamsQuestion(commandText)) return null;
  const topic = detectKnowledgeTopic(commandText) || "core";
  const answer = DIRECT_FAIR_TEAMS_ANSWERS[topic] || DIRECT_FAIR_TEAMS_ANSWERS.core;
  return {
    topic,
    assistantSummary: answer,
    confidence: topic === "core" ? 0.76 : 0.92,
  };
}

export function getFairTeamsKnowledgeForCommand(commandText, context = {}) {
  const text = normalize(`${commandText || ""} ${context?.activeTab || ""} ${context?.rosterMode || ""}`);
  const scored = Object.entries(KNOWLEDGE_SECTIONS)
    .map(([id, section]) => ({ id, ...section, score: id === "core" ? 1 : matchScore(section, text) }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const selected = [];
  const add = (id) => {
    if (!selected.some((section) => section.id === id) && KNOWLEDGE_SECTIONS[id]) {
      selected.push({ id, ...KNOWLEDGE_SECTIONS[id] });
    }
  };

  add("core");
  for (const section of scored) {
    if (section.id !== "core") add(section.id);
    if (selected.length >= 5) break;
  }

  if (/(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster)/i.test(commandText || "")) {
    add("rosterCopy");
    add("localSharedRosters");
    add("backupSync");
  }

  // Questions about the app often mention vague words like "normal", "difference", or "how does it work".
  // Add ratings/roster knowledge when the phrase points at roster modes but misses a direct keyword.
  if (/difference|different|normal|non.?shared|shared|private|local|rating|skill/i.test(commandText || "")) {
    add("ratings");
    add("localSharedRosters");
  }

  return {
    version: FAIR_TEAMS_KNOWLEDGE_VERSION,
    selectionRule: "Use these Fair Teams knowledge sections as source of truth for app-specific Q&A. For feature-explanation questions, answer like a helpful organizer and do not mention beta branches, wiring, implementation status, JSON, APIs, schemas, or developer details unless the user explicitly asks about implementation. If the user asks the assistant to perform an action that is not available from chat yet, say plainly that you understand but cannot change that from chat yet. If the user asks a Fair Teams question and the answer is not covered here, say you do not have that Fair Teams detail yet instead of guessing.",
    answerStyle: "Answer from the user's perspective. Be warm, short, and practical. Explain when to use a feature, what problem it solves, and how it differs from similar features. Prefer examples like 'Use this when...' and avoid technical/developer language.",
    topics: selected.slice(0, 6).map((section) => ({ id: section.id, title: section.title, text: section.text })),
  };
}

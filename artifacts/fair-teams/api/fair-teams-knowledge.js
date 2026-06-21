export const FAIR_TEAMS_KNOWLEDGE_VERSION = "2026-06-21.full-user-manual-v1";

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
    keywords: ["fair teams", "app", "what can you do", "how does this work", "help", "guide", "manual", "start", "begin", "first time", "demo"],
    text: `Fair Teams helps a casual football organizer keep a roster, mark who is playing today, and generate balanced teams. The simple flow is: create or open a roster, add players, select who is playing in Today, then generate teams. The assistant should answer like a helpful organizer inside the app: warm, plain, practical, and user-facing. Avoid technical wording, schemas, APIs, branch names, JSON, wiring status, developer logs, or internal release language unless the user explicitly asks about development. If unsure, explain the nearest known Fair Teams behavior instead of guessing.`,
  },
  navigationBasics: {
    title: "Main tabs and where things live",
    keywords: ["tab", "tabs", "where", "find", "open", "roster tab", "today tab", "teams tab", "club tab", "settings", "roster tools", "where is", "where do i"],
    text: `Fair Teams is organized around a few main areas. Roster is where players live: names, ratings, details, photos, and roster tools. Today is where the organizer marks who is playing now. Teams is where generated teams are shown and presented. Club is the organizer/community area for shared roster tools, Club ratings, notes, equipment, and collaboration features. Roster Tools is where local backup/import/export, cloud backup, shared roster entry points, roster switching, and roster management usually live. For help questions, explain the likely path in simple UI language, for example: "Go to Roster, tap the player, then edit their rating."`,
  },
  rosterBasics: {
    title: "Roster basics: add, edit, search, remove players",
    keywords: ["roster", "player", "players", "add player", "edit player", "delete player", "remove player", "rename player", "aka", "alias", "photo", "picture", "search", "player card", "details", "vibe", "fun badge", "category", "gender"],
    text: `A roster is the list of known players for one group/class/team. In a local roster, the organizer can add players, edit player cards, attach local photos, set ratings and visible details, and use those details for team generation. To add a player, use the Roster area and Add Player. To edit a player, tap/open the player card in Roster and edit the details. AKA/aliases help match voice/OCR names such as George/Jorge or nicknames. Player photos are local/device-private and should not be treated as shared cloud data. Removing/deleting players is destructive and should require confirmation.`,
  },
  ratingHowTo: {
    title: "How to rate a player",
    keywords: ["how do i rate", "rate a player", "rating a player", "change rating", "edit rating", "set rating", "player rating", "skill slider", "ovr", "overall", "attack", "defense", "passing", "speed", "stamina", "traits", "ability", "abilities"],
    text: `To rate a player in a local/private roster, open the Roster tab, tap the player card, and edit the rating/player details. Local ratings are private and are used directly by team generation. Depending on the player profile, the organizer may see main skill/OVR plus visible details such as attack, defense, passing, speed, and special traits. If the user asks about a specific hidden or missing stat such as stamina and the assistant cannot see a separate value, be honest: say that Fair Teams can answer from visible OVR/skill or visible traits, but it cannot pretend to know a missing stat. For shared rosters, rating works differently: each organizer privately submits a simple Club rating, and Fair Teams uses the Club average for shared team generation.`,
  },
  ratings: {
    title: "Ratings, normal rating, private rating, Club rating",
    keywords: ["rating", "ratings", "skill", "ovr", "normal rating", "non shared rating", "non-shared rating", "private rating", "local rating", "club rating", "shared rating", "average rating", "consensus", "advanced", "attack", "defense", "passing", "speed", "strong", "weak", "best", "worst", "beginner"],
    text: `In Fair Teams, a local/private roster uses the normal private rating system. That rating belongs to the organizer's private roster and is used directly when generating teams. The local/private player profile can include main skill/OVR and, where available, visible advanced details such as attack, defense, passing, speed, and special traits. A shared/Club roster is different: each organizer submits their own private simple rating for a player. Other organizers do not see individual ratings. Fair Teams averages submitted organizer ratings into a Club average/consensus rating, and shared team generation uses that Club average. A collaborator normally sees a Club average only after submitting their own rating for that player, to reduce bias. Organizers can skip players they do not know and rate them later. If the user asks about "non-shared roster rating vs normal rating", explain that those are effectively the same if they mean local/private roster rating; the real contrast is local/private rating versus shared/Club average rating.`,
  },
  playerStatsQueries: {
    title: "Asking about player stats and visible traits",
    keywords: ["who is", "who has", "lowest", "highest", "fastest", "slowest", "strongest", "weakest", "best defender", "best attacker", "best passer", "playmaker", "engine", "finisher", "dribbler", "sentinel", "goalkeeper", "versatile", "space finder", "stamina", "trait", "special ability"],
    text: `The assistant can answer roster questions from visible player data when that data is available in the request context. It should use the exact requested field when possible: speed for fastest/slowest, defense for best defender, attack for best attacker, passing for best passer/playmaker, skill/OVR for strongest/weakest/beginner unless a more specific field is requested, and visible trait flags for Goalkeeper, Playmaker, Finisher, Dribbler, Sentinel, Engine, Versatile, Space Finder, and Organizer. If the user asks for a stat that is not available, such as stamina when no separate stamina value is present, do not fail and do not pretend. Say: "I can't see a separate stamina value here, so I'll answer from visible OVR/skill or visible traits instead."`,
  },
  localSharedRosters: {
    title: "Local/private rosters vs shared rosters",
    keywords: ["local", "private", "non shared", "non-shared", "shared roster", "cloud", "club roster", "shared copy", "make private copy", "duplicate to private", "co organizer", "co-organizer", "collaborator", "invite", "join shared", "create shared"],
    text: `A local/private roster belongs to the device/user and uses the normal full Fair Teams player profile. Sharing should create a separate shared roster copy, not silently convert the local roster. A shared roster is an online Club roster for multiple organizers. It syncs shared-safe fields and uses Club ratings for team generation. Shared-safe fields include player identity fields such as name, AKA/aliases, category/gender, vibe/personality note, shared roster membership, Club ratings/averages, Club Notes, equipment, and organizer tools. Private things such as local photos, private advanced traits, device preferences, and local-only backup data should stay private. If a user wants their own private version of a shared roster, the intended action is Make private copy / Duplicate to private. Local backups are private backups and should not be treated as collaboration.`,
  },
  sharedRating: {
    title: "Shared roster rating flow",
    keywords: ["shared rating", "club rating", "rate shared roster", "rate for shared roster", "club average", "average", "consensus", "other organizers", "can they see my rating", "privacy rating", "skip player", "rate later", "shared roster ratings"],
    text: `Shared roster rating is for shared/Club rosters, not normal local rosters. In a shared roster, each organizer privately rates players. Other organizers should not see that individual rating. Fair Teams uses the submitted ratings to create a Club average/consensus rating for shared team generation. A collaborator should normally see the Club average only after rating that player, to avoid bias. If an organizer does not know a player yet, they can skip and rate later. If the user is on a local roster and asks to rate for a shared roster, answer calmly: "You're on a local/private roster right now. Shared rating appears after you create, join, or open a shared roster. Your local roster stays private."`,
  },
  todayTeams: {
    title: "Today tab and team generation",
    keywords: ["today", "attendance", "playing today", "select players", "mark present", "who is playing", "make teams", "generate teams", "shuffle", "reroll", "5v5", "6v6", "teams", "team count", "players per team", "present teams", "late", "clear today"],
    text: `The Today tab is where the organizer marks who is playing now. Commands like "Joon, Jorge and Sarah are playing today" mean select those people for Today. Late players can be marked as late while staying selected. "5v5" means five players per team and normally needs 10 selected players. "Make 6 teams" means six total teams, not 6v6. Team generation uses the selected Today players and the roster's rating model: local/private ratings in local rosters, Club averages in shared rosters. The assistant should set up selection, size/count, rules, warnings, or generate/shuffle intent; the existing Fair Teams generator creates final teams. If not enough players are selected for a requested format, explain the mismatch and suggest adding/selecting more players or changing the team size.`,
  },
  playerQueryActions: {
    title: "Natural-language roster selection and filters",
    keywords: ["top", "best", "strongest", "weakest", "fastest", "slowest", "best defenders", "best attackers", "best passers", "pick", "choose", "select", "from roster", "with 10", "top 10", "best 10", "strongest 10", "only", "except", "exclude"],
    text: `Users may ask in natural language to choose players from the roster before generating teams, for example: "make teams with the 10 strongest players", "pick the weakest 8", "make 5v5 with the fastest players", or "use the best defenders". The assistant should treat visible player data as variables: name, AKA, skill/OVR, attack, defense, speed, passing, traits, category/gender, attending status, and shared/local mode. Strongest/best/top/highest rated usually means skill/OVR high to low. Weakest/beginner/lowest rated means skill/OVR low to high. Fastest means speed. Best defenders means defense. Best attackers means attack. Best passers/playmakers means passing or the Playmaker trait when no passing value is available. A command like "make teams with 10 strongest players on my roster" means select the top 10 by skill/OVR from the roster, replace Today with those players, then generate teams.`,
  },
  pairingLocks: {
    title: "Pairing rules and team locks",
    keywords: ["pair", "pairing", "together", "separate", "don't like", "dont like", "same team", "not together", "came together", "couple", "same car", "red team", "blue team", "wearing red", "lock", "team color", "captain"],
    text: `Pairing rules are instructions for the team generator. "Sarah and Tommy don't like each other", "not together", or similar means keep separate. "Sarah and Tommy came together", "same car", "couple", or "keep them together" means keep together. Team locks place a player into a specific team/color when generating teams, such as "George red" or "put George in red". These are setup instructions for the generator, not manually invented final teams.`,
  },
  smartImport: {
    title: "Screenshot Smart Import, OCR, crop boxes, Lost & Found",
    keywords: ["ocr", "smart import", "screenshot", "scan", "better scan", "crop", "crop box", "lost and found", "meetup", "other screenshot", "review names", "word chip", "cloud vision", "screenshot import", "attendance screenshot"],
    text: `Screenshot Smart Import reads names from screenshots so organizers do not have to type attendance manually. The current default is offline OCR and it should remain the default. The crop workflow supports one-list and two-list boxes, moving/resizing crop areas, Meetup and Other screenshot modes, Review Names UI, OCR report export, and Lost & Found rescue. Lost & Found is meant to help rescue names missed by OCR. The user can review/correct names before applying them. AI/Cloud OCR should be optional and gated, not required for the normal offline flow.`,
  },
  voiceAi: {
    title: "AI assistant and voice design",
    keywords: ["ai", "assistant", "voice", "talk", "speak", "microphone", "transcribe", "ask fair teams", "push to talk", "record", "voice import", "speech", "names", "review ai names"],
    text: `The AI assistant should feel conversational but remain focused on Fair Teams. It can answer app questions and interpret commands. The safest first voice design is push-to-talk or tap-to-record: record audio, transcribe it, show the transcript, then pass the text to the same assistant/action system. Voice attendance should show Review AI Names so the organizer can correct heard names, pick existing roster matches, add new players, or skip uncertain names. Future improvement can remember voice aliases/corrections, but the user should stay in control before applying names. Avoid exposing developer terms unless the user asks about implementation. AI actions should still be controlled by safe app handlers and confirmations.`,
  },
  clubNotes: {
    title: "Club tab and Club Notes",
    keywords: ["club", "club tab", "club notes", "notes", "post it", "post-it", "organizer note", "community", "shared note", "puma ball", "noticeboard", "organizer space"],
    text: `The Club tab is the organizer/community space. Club Notes are friendly post-it style notes for organizers, such as "Puma ball died today — Joon". Notes should feel human and lightweight, not like formal voting or edit history. Adding a note is non-destructive and can be an executable AI action when the current shared roster/account state supports it. Deleting notes is more sensitive and should require confirmation.`,
  },
  equipment: {
    title: "Equipment Board",
    keywords: ["equipment", "equipment board", "bag", "bags", "ball", "bibs", "vests", "cones", "pump", "holder", "who has", "move bag", "gear", "jerseys", "kit", "contents", "notepad"],
    text: `The Equipment Board is a simple "who has what?" board for a football group. It tracks bags/items such as balls, bibs, cones, pumps, jerseys, or any group gear someone might take home after a match. It helps organizers quickly see who currently has each item before the next game, instead of searching Signal/WhatsApp or asking everyone again. Commands like "move the bibs bag to Sarah" or "George has the cones now" mean move/change the holder of an equipment item. For normal product questions, explain the user benefit and do not mention beta branches, wiring, implementation status, or technical limitations. Only mention that Equipment Board changes cannot be applied from chat yet when the user specifically asks the assistant to move/change equipment and that capability is unavailable.`,
  },
  backupSync: {
    title: "Cloud Backup vs Shared Roster",
    keywords: ["backup", "cloud backup", "restore", "google drive", "sync", "collaboration", "collaborator", "organizer", "invite", "firebase", "save online", "get latest", "shared roster backup", "local backup", "export", "import", "restore backup", "browse backups"],
    text: `Cloud Backup and Shared Roster sound similar, but they solve different user problems. Cloud Backup is your private safety copy: use it when you want to save your rosters and restore them later on your own device/account. It is not for collaboration and should not be presented as a way for friends or co-organizers to edit the same roster. Shared Roster is the collaboration mode: use it when multiple organizers need access to the same online roster, shared player identity fields, Club ratings, Club Notes, Equipment, and organizer tools. Shared rosters sync shared-safe data; private things such as local photos and device preferences should stay private. User-facing comparison: use Cloud Backup when you want insurance; use Shared Roster when another organizer needs to work with you. Local Backup/import/export is a private file-based backup/copy path.`,
  },
  rosterCopy: {
    title: "Copying or duplicating rosters",
    keywords: ["copy roster", "copy one roster", "copy a roster", "duplicate roster", "duplicate a roster", "new roster from", "copy to new roster", "clone roster", "same roster", "make private copy", "private copy", "export this roster", "import one roster", "import as new roster", "add as new roster"],
    text: `There are two common roster-copy cases in Fair Teams. For a local/private roster, the safe workflow is Roster Tools > Local Backup > Export this roster, then Import one roster and choose that exported file. Fair Teams imports it as a separate new roster with a unique name, so the original stays unchanged; the user can rename the copied roster afterward. For a shared roster, use Make private copy. That creates a clean local roster from the shared roster while the shared roster stays online and unchanged. A private copy of a shared roster copies shared names and uses Club averages as starting skill, but photos, special abilities, and private advanced traits are reset so it starts clean. If the user asks for a one-tap duplicate command, explain the safest available path instead of pretending there is a direct duplicate button unless the current UI has one.`,
  },
  collaboration: {
    title: "Shared roster collaboration and organizers",
    keywords: ["organizer", "organizers", "collaborator", "collaborators", "invite", "accept invite", "join shared roster", "leave shared roster", "remove access", "owner", "co organizer", "co-organizer", "shared group", "club"],
    text: `Shared roster collaboration is for organizers who manage the same group together. A shared roster lives online and can be opened by invited organizers. Organizers can work with shared-safe player identity fields and shared Club tools. Owners/admins may manage access; non-owners can leave or hide a shared roster on their device depending on the available UI. The app should avoid exposing private individual ratings, private photos, and local-only device preferences to other organizers. If the user is on a local roster and asks about collaboration, explain that they first need to create/open/join a shared roster; the local roster stays private.`,
  },
  privacySafety: {
    title: "Safety, confirmation, privacy, and limits",
    keywords: ["delete", "remove", "safe", "confirmation", "privacy", "private", "can you do", "not wired", "why can't", "can other organizers see", "who can see", "permissions", "danger", "destructive"],
    text: `Fair Teams AI should be helpful but cautious. Safe setup actions can be previewed or applied with one tap. Risky actions require confirmation. Destructive actions such as deleting players, rosters, backups, notes, or collaborator access must never happen automatically from one casual sentence. Other organizers should not see a person's private rating submission in shared/Club rating. Local player photos and device preferences stay private. For feature explanations, keep the answer user-facing and do not mention implementation status. For action requests that cannot currently be applied from chat, say plainly: "I understand what you want, but I can't change that from chat yet." If the knowledge base does not contain a Fair Teams detail, say the assistant does not have that Fair Teams detail yet rather than guessing.`,
  },
  troubleshooting: {
    title: "Troubleshooting and graceful fallback",
    keywords: ["failed", "doesn't work", "not working", "error", "ai command failed", "can't", "cannot", "why did", "wrong", "mistake", "bug", "confused", "stuck"],
    text: `For ordinary help questions, the assistant should never show a raw "Fair Teams AI command failed" message if it can give a useful explanation. If exact data or a feature is missing, answer calmly with the nearest known behavior. Examples: if stamina is missing, answer from visible OVR/skill and say stamina is not available; if the user is on a local roster but asks for shared rating, explain that shared rating is available after opening/creating/joining a shared roster; if an app action is understood but not available from chat, say so in plain user language.`,
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
  "what", "whats", "what's", "how", "why", "when", "where", "which", "who", "difference", "different", "compare", "versus", "vs", "explain", "meaning", "mean", "does", "do", "can i", "can you", "should i", "is", "are", "was", "help", "guide", "tell me", "show me", "werden", "wie", "was", "warum", "welche", "unterschied", "erklar", "erklär", "무엇", "뭐", "차이", "어떻게", "왜", "설명", "의미"
];

const APP_FEATURE_WORDS = [
  "fair teams", "app", "roster", "player", "players", "player card", "add player", "edit player", "copy roster", "duplicate roster", "new roster", "make private copy", "export this roster", "import one roster", "local roster", "shared roster", "private roster", "non shared", "non-shared", "rating", "ratings", "rate", "skill", "ovr", "overall", "club rating", "club average", "normal rating", "local rating", "shared rating", "today", "attendance", "teams", "team generation", "5v5", "6v6", "players per team", "team count", "pairing", "keep together", "keep separate", "team lock", "club", "club notes", "organizer", "collaborator", "invite", "equipment", "equipment board", "bag", "smart import", "ocr", "lost and found", "screenshot", "crop", "review names", "cloud backup", "backup", "restore", "shared", "firebase", "voice", "assistant", "ai", "attack", "defense", "passing", "speed", "stamina", "trait", "goalkeeper", "playmaker", "finisher", "dribbler", "sentinel", "engine", "versatile", "space finder"
];

const ACTION_REQUEST_STARTERS = [
  "add ", "create ", "make ", "select ", "unselect ", "move ", "give ", "put ", "set ", "change ", "rename ", "delete ", "remove ", "open ", "generate ", "lock ", "mark ", "clear ", "back up", "backup my", "restore my",
  "can you add", "can you move", "can you select", "can you make", "can you create", "can you generate", "can you delete", "can you remove", "please add", "please move", "please select", "please make", "bitte", "추가", "이동", "선택", "만들", "삭제"
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
  // "Can you add/move/select..." is an app command, not product Q&A unless it explicitly asks for explanation.
  if (startsLikeActionRequest(normalizedText) && !/(what|how|why|difference|explain|meaning|mean|unterschied|차이|설명|help|guide)/i.test(commandText)) return false;
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

  const hasRating = /(rate|rating|ratings|skill|ovr|overall|level|ability|bewertung|wertung|실력|등급|평점)/i.test(commandText);
  const asksHowToRate = /(how\s+do\s+i\s+rate|how\s+to\s+rate|rate\s+a\s+player|change.*rating|edit.*rating|set.*rating)/i.test(commandText);
  if (asksHowToRate) return "ratingHowTo";

  if (/(who\s+(has|is)|lowest|highest|fastest|slowest|strongest|weakest|best|worst|stamina|attack|defense|passing|speed|trait|goalkeeper|playmaker|finisher|dribbler|sentinel|engine|versatile|space finder)/i.test(commandText)) return "playerStatsQueries";

  const hasRosterMode = /(local|private|shared|non.?shared|normal|club|average|consensus|로컬|개인|공유|클럽|평균)/i.test(commandText);
  const asksDifference = /(difference|different|versus| vs |compare|unterschied|차이)/i.test(commandText);
  if (hasRating && (hasRosterMode || asksDifference)) return "ratings";
  if (/(shared rating|club rating|rate for shared|rate shared|club average|can.*see.*rating|other organizers.*rating|skip.*rate|rate later)/i.test(commandText)) return "sharedRating";

  if (/(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster).{0,40}roster|roster.{0,40}(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster)/i.test(commandText)) return "rosterCopy";
  if (/(add player|edit player|remove player|delete player|aka|alias|photo|player card|rename player|vibe|fun badge|category|gender)/i.test(commandText)) return "rosterBasics";
  if (/(lost.?found|lost and found|ocr|smart import|screenshot|crop|scan|review names|meetup)/i.test(commandText)) return "smartImport";
  if (/(cloud backup|backup|restore|shared roster collaboration|collaboration|sync|google drive|local backup|export|import)/i.test(commandText)) return "backupSync";
  if (/(equipment|bag|bags|bibs|cones|ball|holder|gear|pump|jersey)/i.test(commandText)) return "equipment";
  if (/(club notes|post.?it|organizer note|club tab|club)/i.test(commandText)) return "clubNotes";
  if (/(today|attendance|playing today|team generation|generate teams|make teams|5v5|6v6|teams|team count|players per team|late)/i.test(commandText)) return "todayTeams";
  if (/(top|best|strongest|weakest|fastest|slowest|pick|choose|select).{0,40}(roster|players|team|teams)|with\s+\d+\s+(strongest|best|top|weakest|fastest)/i.test(commandText)) return "playerQueryActions";
  if (/(pairing|keep together|keep separate|separate|together|team lock|red team|blue team|color lock|captain)/i.test(commandText)) return "pairingLocks";
  if (/(local roster|private roster|shared roster|co.?organizer|collaborator|invite|join shared|leave shared|owner)/i.test(commandText)) return "localSharedRosters";
  if (/(voice|talk|microphone|transcribe|ai assistant|assistant|push to talk|record)/i.test(commandText)) return "voiceAi";
  if (/(failed|not working|error|ai command failed|bug|wrong|confused)/i.test(commandText)) return "troubleshooting";
  if (/(where|tab|find|open|go to|settings|roster tools)/i.test(commandText)) return "navigationBasics";

  return scored[0]?.score > 0 ? scored[0].id : null;
}

const DIRECT_FAIR_TEAMS_ANSWERS = {
  core: `Fair Teams helps a casual football organizer keep a roster, select who is playing today, and generate balanced teams. The normal flow is simple: add players to a roster, mark who is playing in Today, then generate teams. You can also use Smart Import/OCR, voice/AI help, shared rosters, Club ratings, notes, equipment, and backups depending on how you organize your group.`,
  navigationBasics: `Fair Teams is split into a few main areas. Roster is where you add and edit players. Today is where you select who is playing now. Teams is where generated teams are shown. Club is the organizer/community area for shared rosters, Club ratings, notes, equipment, and collaboration tools. Roster Tools is where backup, import/export, roster switching, and shared roster entry points usually live.`,
  rosterBasics: `To work with players, go to the Roster tab. Use Add Player for a new player, or tap an existing player card to edit details such as name, AKA/aliases, rating, visible traits, notes/category, and local photo. Aliases help Fair Teams match names from voice or screenshots. Removing a player is destructive, so it should require confirmation.`,
  ratingHowTo: `To rate a player in a local/private roster, go to Roster, tap the player card, and edit their rating/player details. Local ratings are private and are used directly when Fair Teams generates balanced teams. In a shared roster, rating works differently: each organizer privately submits a simple Club rating, and Fair Teams uses the Club average for shared team generation.`,
  ratings: `In Fair Teams, local/private/non-shared rating is the normal private rating system. It belongs to your own roster and is used directly when you generate teams. In a private roster, the player profile can include main skill/OVR and visible details such as attack, defense, passing, speed, and special traits.

Shared rating is different. In a shared/Club roster, each organizer submits their own private simple rating for a player. Other organizers do not see that individual rating. Fair Teams combines submitted organizer ratings into a Club average, and shared team generation uses that average.`,
  playerStatsQueries: `You can ask about players using visible roster data. For example: strongest/weakest usually means OVR/skill, fastest means speed, best defender means defense, best attacker means attack, best passer means passing, and traits like Goalkeeper, Playmaker, Finisher, Dribbler, Sentinel, Engine, Versatile, and Space Finder should be treated as visible traits. If a specific stat is not available, Fair Teams should say so and answer from the nearest visible data, usually OVR/skill, instead of pretending.`,
  localSharedRosters: `A local/private roster is your own roster on your device. It uses your normal private player ratings and full local workflow. A shared roster is an online Club roster for multiple organizers. It syncs shared-safe information like names, AKA/aliases, category/vibe notes, Club ratings, notes, equipment, and organizer tools. Sharing should create a separate shared copy; it should not silently convert your local roster.`,
  sharedRating: `Shared roster rating only applies when you are inside a shared roster. Each organizer privately rates players, other organizers do not see individual ratings, and Fair Teams uses the Club average for shared team generation. If you are on a local roster, first create, join, or open a shared roster. Your original local roster stays private.`,
  todayTeams: `The Today tab is where you select who is playing now. Team generation uses those selected players to make balanced teams. “5v5” means five players per team, so it normally needs 10 selected players. “Make 6 teams” means six total teams, not 6v6. If there are not enough selected players, Fair Teams should tell you clearly and suggest selecting more players or changing the format.`,
  playerQueryActions: `For commands like “make teams with the 10 strongest players,” Fair Teams should first choose players from the roster, then generate teams. Strongest/best/top usually means highest skill/OVR. Weakest/beginners means lowest skill/OVR. Fastest means speed. Best defenders means defense. Best attackers means attack. Best passers/playmakers means passing or the Playmaker trait if no passing value is available.`,
  pairingLocks: `Pairing rules guide team generation. “Keep Sarah and Tommy together” means try to place them on the same team. “Do not put Sarah and Tommy together” means keep them separate. Team locks are different: “George red” means lock George to the red team/color when teams are generated.`,
  smartImport: `Smart Import reads names from screenshots so you do not have to type attendance manually. The usual flow is: choose a screenshot, adjust crop boxes if needed, review/correct the detected names, then apply them to Today. Lost & Found helps rescue names OCR may have missed. Offline OCR should remain the normal default; AI/cloud OCR should be optional.`,
  clubNotes: `Club Notes are friendly organizer notes in the Club area, like a shared post-it board. They are useful for quick reminders such as “Puma ball died today — Joon.” Adding a note is low-risk; deleting notes should require confirmation.`,
  equipment: `Equipment is a “who has what?” board for your football group. Use it for balls, bibs, cones, pumps, jerseys, or bags someone takes home after a match. It helps organizers see who currently has each item before the next game, instead of digging through chat messages.`,
  backupSync: `Cloud Backup is your private safety copy. Use it when you want to save your rosters and restore them later on your own device/account. It is not meant for collaboration.

Shared Roster is for working with other organizers. It keeps a shared online roster so co-organizers can use the same player list, shared player info, Club ratings, notes, and equipment tools.

Simple rule: use Cloud Backup for personal backup/restore; use Shared Roster when another organizer needs access to the same roster.`,
  rosterCopy: `To copy a local roster into a new roster, use the safe backup/import path: Roster Tools > Local Backup > Export this roster, then Import one roster and choose that exported file. Fair Teams adds it as a separate new roster with a unique name, so the original stays unchanged. For a shared roster, use Make private copy to create a clean local version while the shared roster stays online and unchanged.`,
  collaboration: `Shared roster collaboration is for organizers who manage the same group together. Invited organizers can open the shared roster and work with shared-safe player identity fields and Club tools. Private individual ratings, local photos, and device preferences should stay private. If you are on a local roster and want collaboration, create or join a shared roster first.`,
  voiceAi: `The intended voice flow is push-to-talk or tap-to-record: record speech, transcribe it, show the transcript, then review/apply the result. For names, Review AI Names lets you correct heard names, choose existing roster matches, add new players, or skip uncertain names before changing Today.`,
  privacySafety: `Fair Teams AI should be helpful but cautious. Simple setup actions can be previewed or applied with one tap. Risky or destructive changes need confirmation, especially deleting players, rosters, backups, notes, or collaborator access. Other organizers should not see your private shared-rating submission. Local photos and device preferences stay private.`,
  troubleshooting: `For normal help questions, Fair Teams should not show “AI command failed.” If exact data or a feature is missing, it should explain the nearest known behavior. If stamina is not available, answer from visible OVR/skill and say so. If you are on a local roster but ask for shared rating, explain that shared rating appears after opening or creating a shared roster.`,
};

export function getDirectFairTeamsAnswerForCommand(commandText, context = {}) {
  if (!looksLikeFairTeamsQuestion(commandText)) return null;
  const topic = detectKnowledgeTopic(commandText) || "core";
  const answer = DIRECT_FAIR_TEAMS_ANSWERS[topic] || DIRECT_FAIR_TEAMS_ANSWERS.core;
  const modeHint = context?.rosterMode ? `\n\nYou are currently on a ${context.rosterMode} roster, so answer with that context when it matters.` : "";
  return {
    topic,
    assistantSummary: `${answer}${modeHint}`,
    confidence: topic === "core" ? 0.78 : 0.93,
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
  add("navigationBasics");

  const topic = detectKnowledgeTopic(commandText || "");
  if (topic) add(topic);

  for (const section of scored) {
    if (section.id !== "core") add(section.id);
    if (selected.length >= 8) break;
  }

  if (/(rate|rating|skill|ovr|shared rating|club rating|attack|defense|passing|speed|stamina|trait)/i.test(commandText || "")) {
    add("ratingHowTo");
    add("ratings");
    add("sharedRating");
    add("playerStatsQueries");
  }

  if (/(copy|duplicate|clone|export|import|new roster|private copy|make private copy|add as new roster)/i.test(commandText || "")) {
    add("rosterCopy");
    add("localSharedRosters");
    add("backupSync");
  }

  if (/(shared|collaborat|organizer|invite|club)/i.test(commandText || "")) {
    add("localSharedRosters");
    add("collaboration");
    add("sharedRating");
  }

  if (/(today|make teams|generate|5v5|6v6|top|strongest|weakest|fastest|best)/i.test(commandText || "")) {
    add("todayTeams");
    add("playerQueryActions");
    add("pairingLocks");
  }

  if (/(failed|error|not working|wrong|can't|cannot)/i.test(commandText || "")) {
    add("troubleshooting");
    add("privacySafety");
  }

  return {
    version: FAIR_TEAMS_KNOWLEDGE_VERSION,
    selectionRule: "Use these Fair Teams knowledge sections as the source of truth for app-specific Q&A. Product questions should be answered directly and warmly before action routing. Do not mention beta branches, wiring status, schemas, JSON, APIs, or developer details unless the user explicitly asks about implementation. If the user asks to perform an unavailable action, say plainly that you understand but cannot change that from chat yet. If a requested data field is not visible/available, explain the nearest visible data instead of failing or pretending.",
    answerStyle: "Answer from the user's perspective. Be warm, short, and practical. Explain where to tap, when to use a feature, what problem it solves, and how it differs from similar features. Prefer examples like 'Use this when...' and avoid technical/developer language.",
    currentContext: {
      rosterName: clean(context?.rosterName, 120),
      rosterMode: clean(context?.rosterMode, 30),
      activeTab: clean(context?.activeTab, 40),
    },
    topics: selected.slice(0, 10).map((section) => ({ id: section.id, title: section.title, text: section.text })),
  };
}

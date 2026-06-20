export const FAIR_TEAMS_KNOWLEDGE_VERSION = "2026-06-20.kb-v1";

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
    text: `Fair Teams is a casual football organizer app. The core workflow is: keep a roster of known players, mark who is playing today, then generate balanced teams. The assistant should be friendly, but its special role is app help and safe app actions. It should not pretend it can change data unless a capability is wired. It can explain supported features, preview understood actions, and ask for confirmation when changes are risky.`,
  },
  localSharedRosters: {
    title: "Local/private rosters vs shared rosters",
    keywords: ["local", "private", "non shared", "non-shared", "shared roster", "cloud", "club roster", "make private copy", "duplicate to private"],
    text: `A local/private roster belongs to the device/user and uses the normal full Fair Teams player profile. Sharing should create a separate shared roster copy, not silently convert the local roster. A shared roster is an online Club roster for multiple organizers. It syncs shared-safe fields and uses Club ratings for team generation. If a user wants their own private version of a shared roster, the intended action is make/duplicate a private copy. Local backups are private backups and should not be treated as collaboration.`,
  },
  ratings: {
    title: "Ratings, normal rating, private rating, Club rating",
    keywords: ["rating", "ratings", "skill", "ovr", "normal rating", "non shared rating", "non-shared rating", "private rating", "club rating", "average rating", "consensus", "advanced", "attack", "defense", "passing", "speed"],
    text: `In Fair Teams, a non-shared/local/private roster uses the normal private rating system. That rating belongs to the organizer's private roster and is used directly by team generation. The private/local player profile can include main skill/OVR and, where available, private advanced details like attack, defense, passing, speed, and special traits. A shared/Club roster is different: each organizer submits their own private simple rating for a player. Other organizers do not see individual ratings. Fair Teams averages submitted organizer ratings into a Club average/consensus rating, and shared team generation uses that Club average. A collaborator should normally see a Club average only after submitting their own rating for that player, to avoid bias. Organizers can skip players they do not know and rate them later. If the user asks about "non-shared roster rating vs normal rating", explain that those are effectively the same if they mean local/private roster rating; the real difference is local/private rating versus shared/Club average rating.`,
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
    text: `The Equipment Board tracks bags/items such as balls, bibs, cones, pump, or jerseys and who currently holds them. It is useful for organizers who share responsibility for equipment. Commands like "move the bibs bag to Sarah" or "George has the cones now" mean move/change the holder of an equipment item. In the current AI branch, equipment actions may be understood but not fully wired to execute yet, so the assistant should clearly say it understands and whether it is apply-able.`,
  },
  backupSync: {
    title: "Backup, sync, and collaboration",
    keywords: ["backup", "cloud backup", "restore", "google drive", "sync", "collaboration", "collaborator", "organizer", "invite", "firebase", "save online", "get latest"],
    text: `Cloud Backup is private manual all-rosters backup/restore. It should not be described as collaboration. Shared rosters/collaboration are separate and online. Shared roster data is intended to autosync shared-safe fields, while private/local data such as photos and private preferences should not be casually shared. Invite/collaborator features belong to shared rosters/Club mode.`,
  },
  voiceAi: {
    title: "AI assistant and voice design",
    keywords: ["ai", "assistant", "voice", "talk", "speak", "microphone", "transcribe", "ask fair teams"],
    text: `The AI assistant should feel conversational but remain focused on Fair Teams. It can answer simple app questions and interpret commands. The safest first voice design is push-to-talk or tap-to-record: record audio, transcribe it, show the transcript, then pass the text to the same assistant/action system. Realtime always-listening voice is a later feature. AI actions should be controlled by capability handlers, not free-form model decisions.`,
  },
  privacySafety: {
    title: "Safety, confirmation, and limits",
    keywords: ["delete", "remove", "safe", "confirmation", "privacy", "can you do", "not wired", "why can't"],
    text: `Safe simple actions can be applied or one-tap applied. Risky actions require confirmation. Destructive actions such as deleting players, rosters, backups, notes, or collaborator access must never happen automatically from one casual sentence. If the assistant understands a request but the app has no handler yet, it should say it understands but that the action is not wired yet. If the knowledge base does not contain a Fair Teams detail, it should say it does not have that detail yet rather than guessing.`,
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

  // Questions about the app often mention vague words like "normal", "difference", or "how does it work".
  // Add ratings/roster knowledge when the phrase points at roster modes but misses a direct keyword.
  if (/difference|different|normal|non.?shared|shared|private|local|rating|skill/i.test(commandText || "")) {
    add("ratings");
    add("localSharedRosters");
  }

  return {
    version: FAIR_TEAMS_KNOWLEDGE_VERSION,
    selectionRule: "Use these Fair Teams knowledge sections as source of truth for app-specific Q&A. If the user asks a Fair Teams question and the answer is not covered here, say you do not have that Fair Teams detail yet instead of guessing.",
    topics: selected.slice(0, 6).map((section) => ({ id: section.id, title: section.title, text: section.text })),
  };
}

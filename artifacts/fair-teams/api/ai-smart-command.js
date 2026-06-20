const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_SMART_COMMAND_MODEL || "gpt-4o-mini";
const MAX_COMMAND_CHARS = 4000;
const MAX_ROSTER_PLAYERS = 80;

function serverEnabled() {
  return String(process.env.AI_SMART_COMMAND_SERVER_ENABLED || "").toLowerCase() === "true";
}

function getAllowedBranch() {
  return process.env.AI_SMART_COMMAND_ALLOWED_BRANCH || "";
}

function runningBranch() {
  return process.env.VERCEL_GIT_COMMIT_REF || process.env.VERCEL_BRANCH_URL || "";
}

function branchAllowed() {
  const allowed = getAllowedBranch().trim();
  if (!allowed) return true;
  const branch = runningBranch();
  return branch === allowed || branch.includes(allowed);
}

function cleanString(value, max = 300) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function cleanRoster(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ROSTER_PLAYERS).map((player) => {
    const item = player && typeof player === "object" ? player : {};
    return {
      id: cleanString(item.id, 120),
      name: cleanString(item.name, 120),
      aka: cleanString(item.aka, 180),
      skill: cleanNumber(item.skill),
      attack: cleanNumber(item.attack),
      defense: cleanNumber(item.defense),
      speed: cleanNumber(item.speed),
      passing: cleanNumber(item.passing),
      isGoalkeeper: Boolean(item.isGoalkeeper),
      isPlaymaker: Boolean(item.isPlaymaker),
      isFinisher: Boolean(item.isFinisher),
      isDribbler: Boolean(item.isDribbler),
      isSentinel: Boolean(item.isSentinel),
      isEngine: Boolean(item.isEngine),
      isVersatile: Boolean(item.isVersatile),
      isSpaceFinder: Boolean(item.isSpaceFinder),
      isOrganizer: Boolean(item.isOrganizer),
      gender: cleanString(item.gender, 30),
      funBadge: cleanString(item.funBadge, 60),
      attending: Boolean(item.attending),
    };
  }).filter((player) => player.id && player.name);
}

function cleanContext(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    rosterName: cleanString(item.rosterName, 120),
    rosterMode: cleanString(item.rosterMode, 30),
    activeTab: cleanString(item.activeTab, 40),
    currentTeamCount: cleanNumber(item.currentTeamCount),
    currentPlayersPerTeam: cleanNumber(item.currentPlayersPerTeam),
    uiLanguage: cleanString(item.uiLanguage, 40),
  };
}

const jsonSchema = {
  name: "fair_teams_smart_command",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "ok", "detectedLanguage", "normalizedIntent", "assistantSummary", "confidence", "actions", "confirmations", "unresolved"],
    properties: {
      schemaVersion: { type: "number" },
      ok: { type: "boolean" },
      detectedLanguage: { type: "string" },
      normalizedIntent: { type: "string" },
      assistantSummary: { type: "string" },
      confidence: { type: "number" },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "playerRefs", "newPlayerName", "suggestedSkill", "playersPerTeam", "teamCount", "pairingKind", "teamLabel", "role", "attribute", "distribution", "requiresConfirmation", "reason"],
          properties: {
            type: { type: "string", enum: ["select_players", "unselect_players", "add_new_player_suggestion", "set_new_player_skill", "set_team_size", "set_team_count", "add_pairing_rule", "lock_player_to_team", "spread_role_across_teams", "balance_by_attribute", "generate_teams", "ask_confirmation", "ask_clarifying_question", "no_action"] },
            playerRefs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["playerId", "rosterName", "spokenName", "confidence"],
                properties: {
                  playerId: { type: ["string", "null"] },
                  rosterName: { type: ["string", "null"] },
                  spokenName: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            newPlayerName: { type: ["string", "null"] },
            suggestedSkill: { type: ["number", "null"] },
            playersPerTeam: { type: ["number", "null"] },
            teamCount: { type: ["number", "null"] },
            pairingKind: { type: ["string", "null"], enum: ["keep_together", "keep_separate", "unknown", null] },
            teamLabel: { type: ["string", "null"] },
            role: { type: ["string", "null"], enum: ["defender", "attacker", "goalkeeper", "playmaker", "fast_player", "strong_player", "beginner", "experienced_player", "unknown", null] },
            attribute: { type: ["string", "null"] },
            distribution: { type: ["string", "null"] },
            requiresConfirmation: { type: "boolean" },
            reason: { type: ["string", "null"] }
          }
        }
      },
      confirmations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "message", "playerRefs", "suggestedActionType"],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["missing_player", "ambiguous_player", "add_rule", "add_new_player", "destructive_action", "unclear"] },
            message: { type: "string" },
            playerRefs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["playerId", "rosterName", "spokenName", "confidence"],
                properties: {
                  playerId: { type: ["string", "null"] },
                  rosterName: { type: ["string", "null"] },
                  spokenName: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            },
            suggestedActionType: { type: ["string", "null"], enum: ["select_players", "unselect_players", "add_new_player_suggestion", "set_new_player_skill", "set_team_size", "set_team_count", "add_pairing_rule", "lock_player_to_team", "spread_role_across_teams", "balance_by_attribute", "generate_teams", "ask_confirmation", "ask_clarifying_question", "no_action", null] }
          }
        }
      },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "issue", "message"],
          properties: {
            text: { type: "string" },
            issue: { type: "string", enum: ["unknown_player", "ambiguous_player", "unknown_intent", "missing_context", "unsupported_action"] },
            message: { type: "string" }
          }
        }
      }
    }
  }
};

function systemPrompt() {
  return `You are Fair Teams Smart Command, a multilingual command parser for a casual football team-making app.

Important behavior:
- The user may speak or type in any language, including mixed-language commands. Understand the intent and return the same action schema.
- Return the same language-independent JSON action schema regardless of input language.
- Preserve player names exactly as user says them when uncertain. Do not translate names.
- Match spoken names to roster players using name and aka/aliases. Return roster player IDs only when confident.
- Never invent roster player IDs.
- Treat phrases like "are playing today", "spielen heute", "kommen heute", "오늘 와", "오늘 뛰어", "for today", "select", "add to today", and bare comma-separated player lists as a request to select those players for today's game.
- When the command includes a player list, create a select_players action containing EVERY confidently matched existing roster player from that list. Do not drop names just because the user also asks to generate teams.
- If a listed player is not in the roster, create an add_new_player_suggestion action for that exact name AND add a missing_player confirmation asking whether to add them.
- If a listed name is ambiguous or similar to multiple roster names/aliases, add an ambiguous_player confirmation instead of guessing.
- If user says "make 5v5" or similar but only names fewer than 10 total players in the command, still set playersPerTeam 5, but add unresolved missing_context explaining that 10 players are needed for 5v5 and only the named/selected players were found.
- If user gives a rough skill description like "a bit experienced", "quite good", "Anfänger", "잘해", map it to suggestedSkill on 1-10 if clearly implied. Use null if not clear.
- Interpret social phrases: "they don't like each other", "they fight", "nicht zusammen", "같이 두지 마" as keep_separate. "came together", "couple", "친구라 같이" as keep_together.
- Interpret team constraints: "George red", "put George in red", "George trägt rot", "조지는 빨강팀" as lock_player_to_team with teamLabel red.
- Interpret "6v6", "six versus six", "sechs gegen sechs", "6대6" as set_team_size playersPerTeam 6.
- Interpret "separate one good defender into each team" as spread_role_across_teams role defender distribution one_per_team.
- In shared roster mode, avoid private advanced-stat assumptions unless the roster data provides clear role signals. Ask a clarifying question if needed.
- AI does not generate final teams. It only returns safe app actions for Fair Teams to execute.
- Destructive changes require confirmation.
- Be concise in assistantSummary and use the user's likely UI language.`;
}

export default async function handler(req, res) {
  res.setHeader?.("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }
  if (!serverEnabled()) {
    return res.status(403).json({ error: "AI Smart Command is disabled on this deployment." });
  }
  if (!branchAllowed()) {
    return res.status(403).json({ error: "AI Smart Command is not enabled for this branch." });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const commandText = cleanString(body.commandText, MAX_COMMAND_CHARS);
  const roster = cleanRoster(body.roster);
  const context = cleanContext(body.context);

  if (!commandText) {
    return res.status(400).json({ error: "Missing commandText." });
  }

  const payload = {
    model: DEFAULT_MODEL,
    temperature: 0.1,
    max_output_tokens: 1800,
    input: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          task: "Parse the user command into Fair Teams actions. Pay special attention to every player name mentioned in commandText. If a person is named as playing today, they must appear either as a matched playerRef in select_players or as a missing/ambiguous confirmation.",
          commandText,
          context,
          roster,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        ...jsonSchema,
      },
    },
  };

  const aiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const aiPayload = await aiResponse.json().catch(() => null);
  if (!aiResponse.ok) {
    const message = aiPayload?.error?.message || "OpenAI request failed.";
    return res.status(502).json({ error: message });
  }

  const outputText = typeof aiPayload?.output_text === "string"
    ? aiPayload.output_text
    : Array.isArray(aiPayload?.output)
      ? aiPayload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
          .map((content) => content?.text || "")
          .join("\n")
          .trim()
      : "";

  if (!outputText) {
    return res.status(502).json({ error: "AI returned no structured output." });
  }

  try {
    const parsed = JSON.parse(outputText);
    return res.status(200).json(parsed);
  } catch {
    return res.status(502).json({ error: "AI returned invalid JSON." });
  }
}

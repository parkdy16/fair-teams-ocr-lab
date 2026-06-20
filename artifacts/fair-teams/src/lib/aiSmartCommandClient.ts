import type {
  AiSmartCommandRequest,
  AiSmartCommandResponse,
  AiSmartCommandRosterPlayer,
  AiSmartCommandContext,
} from "./aiSmartCommandTypes";

function cleanRosterForAi(roster: AiSmartCommandRosterPlayer[]): AiSmartCommandRosterPlayer[] {
  return roster.slice(0, 80).map((player) => ({
    id: String(player.id || ""),
    name: String(player.name || "").trim(),
    aka: typeof player.aka === "string" && player.aka.trim() ? player.aka.trim() : undefined,
    skill: typeof player.skill === "number" ? player.skill : undefined,
    attack: typeof player.attack === "number" ? player.attack : undefined,
    defense: typeof player.defense === "number" ? player.defense : undefined,
    speed: typeof player.speed === "number" ? player.speed : undefined,
    passing: typeof player.passing === "number" ? player.passing : undefined,
    isGoalkeeper: Boolean(player.isGoalkeeper),
    isPlaymaker: Boolean(player.isPlaymaker),
    isFinisher: Boolean(player.isFinisher),
    isDribbler: Boolean(player.isDribbler),
    isSentinel: Boolean(player.isSentinel),
    isEngine: Boolean(player.isEngine),
    isVersatile: Boolean(player.isVersatile),
    isSpaceFinder: Boolean(player.isSpaceFinder),
    isOrganizer: Boolean(player.isOrganizer),
    gender: typeof player.gender === "string" ? player.gender : undefined,
    funBadge: typeof player.funBadge === "string" ? player.funBadge : undefined,
    attending: Boolean(player.attending),
  })).filter((player) => player.id && player.name);
}

export async function parseFairTeamsSmartCommand(input: AiSmartCommandRequest): Promise<AiSmartCommandResponse> {
  const commandText = input.commandText.trim();
  if (!commandText) throw new Error("Write or speak a Fair Teams command first.");

  const response = await fetch("/api/ai-smart-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commandText: commandText.slice(0, 4000),
      roster: cleanRosterForAi(input.roster),
      context: input.context || {},
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Fair Teams AI command failed.");
  }
  return payload as AiSmartCommandResponse;
}

export function createAiSmartCommandContext(context: AiSmartCommandContext): AiSmartCommandContext {
  return {
    rosterName: context.rosterName,
    rosterMode: context.rosterMode,
    activeTab: context.activeTab,
    currentTeamCount: context.currentTeamCount,
    currentPlayersPerTeam: context.currentPlayersPerTeam,
    uiLanguage: context.uiLanguage || (typeof navigator !== "undefined" ? navigator.language : undefined),
  };
}

export async function transcribeFairTeamsVoiceCommand(audioBlob: Blob): Promise<{ transcript: string; language?: string }> {
  if (!audioBlob || audioBlob.size === 0) throw new Error("No voice recording found.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read voice recording."));
    reader.readAsDataURL(audioBlob);
  });

  const response = await fetch("/api/ai-voice-transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: dataUrl,
      mimeType: audioBlob.type || "audio/webm",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Fair Teams voice could not transcribe that recording.");
  }
  const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
  if (!transcript) throw new Error("I could not hear a clear command. Try again closer to the phone.");
  return { transcript, language: typeof payload?.language === "string" ? payload.language : undefined };
}

import React, { useEffect, useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import type { RoomPlayer } from "@/lib/localRoster";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Mic, Search, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function displayName(player: Pick<RoomPlayer, "name" | "aka">) {
  const aka = player.aka?.trim();
  return aka ? `${player.name} (${aka})` : player.name;
}

function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-800 border border-sky-200">
      NEW
    </span>
  );
}
function GKBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 border border-emerald-200">
      GK
    </span>
  );
}

function ORGBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-black text-orange-800 border border-orange-200">
      ORG
    </span>
  );
}

type OcrMatchStatus = "match" | "suggest" | "new";

type OcrNameCandidate = {
  name: string;
  status: OcrMatchStatus;
  bestMatch?: RoomPlayer;
  score?: number;
  suggestions: Array<{ player: RoomPlayer; score: number }>;
};

function ocrCandidateKey(candidate: OcrNameCandidate) {
  return candidate.bestMatch
    ? `roster:${candidate.bestMatch.id}`
    : `new:${normalizeForMatch(candidate.name)}`;
}

function createOcrPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ocr-player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const OCR_JUNK_WORDS = new Set([
  "attendees",
  "attendee",
  "checked",
  "check",
  "not checked",
  "checked in",
  "member",
  "members",
  "event host",
  "host",
  "detailed list",
  "event question",
  "search attendees",
  "search",
  "rsvp",
  "yes",
  "no",
  "maybe",
  "not sure",
  "sure",
  "where",
  "profile",
  "view profile",
  "see more",
  "going",
  "share",
  "message",
  "organizer",
  "today",
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "first event",
  "cannot join",
  "coming soon",
  "jpg",
  "jpeg",
  "png",
  "mo be en",
  "nesw",
  "x attendees",
  "first event ooo",
  "member first event ooo",
  "i could",
  "na",
  "where s the rsvp question",
  "i thought it was moved to august",
  "have no idea",
  "i have no idea",
  "cannot join",
  "can not join",
]);

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOcrLine(value: string) {
  return value
    .replace(/---.*?\.(jpg|jpeg|png).*?---/gi, " ")
    .replace(/[•●▪︎◆◇▶︎►=_%#¥§¢\[\]{}<>]/g, " ")
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, "")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ .'-]/g, " ")
    .replace(/\s+\.\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MEETUP_MARKER_PATTERN = /\b(?:member|event host)\b/i;
const MEETUP_SPLIT_PATTERN = /\b(?:member|event host)\b/gi;

const MEETUP_STOP_WORDS = new Set([
  "checked",
  "check",
  "in",
  "not",
  "attendee",
  "attendees",
  "list",
  "scan",
  "search",
  "event",
  "question",
  "detailed",
  "yes",
  "no",
  "maybe",
  "ok",
  "okay",
  "understood",
  "of",
  "course",
  "i",
  "im",
  "i'm",
  "m",
  "both",
  "think",
  "got",
  "well",
  "into",
  "categories",
  "good",
  "vibes",
  "guaranteed",
  "goals",
  "so",
  "much",
  "you",
  "know",
  "me",
  "the",
  "to",
  "at",
  "and",
  "or",
]);

const MEETUP_NOISE_WORDS = new Set([
  "ee",
  "oe",
  "eee",
  "oes",
  "coe",
  "ooo",
  "na",
  "hh",
  "cr",
  "el",
  "jh",
  "yg",
  "xt",
  "ed",
  "fo",
  "ja",
  "tz",
  "ember",
]);

const OCR_LEADING_NAME_NOISE = new Set([
  "ir",
  "mr",
  "mrs",
  "ms",
  "dr",
  "sir",
  "jr",
  "sr",
]);

function tokenKey(value: string) {
  return normalizeForMatch(value).replace(/\s+/g, "");
}

function isMeetupNoiseToken(value: string) {
  const key = tokenKey(value);
  return !key || MEETUP_NOISE_WORDS.has(key) || /^[a-z]$/i.test(key);
}

function isProbablySingleUsername(value: string) {
  const clean = cleanOcrLine(value);
  return /^[A-Za-z][A-Za-z._'-]{2,24}$/.test(clean) && !clean.includes(" ");
}

function extractMeetupNameBeforeMarker(chunk: string) {
  const cleaned = cleanOcrLine(chunk);
  if (!cleaned) return null;

  let tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  while (tokens.length && isMeetupNoiseToken(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  if (!tokens.length) return null;

  let startAfter = -1;
  tokens.forEach((token, index) => {
    const key = tokenKey(token);
    if (MEETUP_STOP_WORDS.has(key) || MEETUP_NOISE_WORDS.has(key)) {
      startAfter = index;
    }
  });

  tokens = tokens.slice(startAfter + 1);
  while (tokens.length && isMeetupNoiseToken(tokens[0])) {
    tokens = tokens.slice(1);
  }
  // OCR can attach tiny avatar/UI fragments before a real name, for example
  // "ir Danill Member". Remove only known title-like fragments, not real
  // short name particles such as "De" in "Karim De La Cruz".
  while (tokens.length > 1 && OCR_LEADING_NAME_NOISE.has(tokenKey(tokens[0]))) {
    tokens = tokens.slice(1);
  }
  while (tokens.length && isMeetupNoiseToken(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  if (!tokens.length) return null;

  const maxWords = Math.min(4, tokens.length);
  for (let length = maxWords; length >= 1; length -= 1) {
    const candidate = tokens.slice(tokens.length - length).join(" ");
    const normalizedWords = normalizeForMatch(candidate)
      .split(" ")
      .filter(Boolean);
    if (normalizedWords.some((word) => MEETUP_STOP_WORDS.has(word))) continue;
    if (isProbablyName(candidate) || isProbablySingleUsername(candidate)) {
      return cleanOcrLine(candidate);
    }
  }

  return null;
}

function extractInlineMeetupNames(text: string) {
  const oneLineText = text
    .replace(/---.*?\.(jpg|jpeg|png).*?---/gi, " ")
    .replace(/\r?\n/g, " ");
  const cleaned = cleanOcrLine(oneLineText);
  if (!MEETUP_MARKER_PATTERN.test(cleaned)) return [];

  const parts = cleaned.split(MEETUP_SPLIT_PATTERN);
  const names: string[] = [];

  // Every part except the final tail is the text immediately before a
  // Meetup marker. In collapsed OCR, this is where names like
  // "I'm both Alex Member" or "... not checked in Ayeshni Hh Member" live.
  for (let index = 0; index < parts.length - 1; index += 1) {
    const name = extractMeetupNameBeforeMarker(parts[index]);
    if (name) names.push(name);
  }

  return names;
}

function findRosterAliasesInTokens(tokens: string[], roster: RoomPlayer[]) {
  const normalizedTokens = tokens.map((token) => normalizeForMatch(token));
  const used = new Array(tokens.length).fill(false);
  const foundNames: string[] = [];

  for (const player of roster) {
    const aliases = [player.name, player.aka]
      .filter(Boolean)
      .map((value) => normalizeForMatch(String(value)))
      .filter((value) => value.length >= 3);

    for (const alias of aliases) {
      const aliasTokens = alias.split(" ").filter(Boolean);
      if (!aliasTokens.length || aliasTokens.length > tokens.length) continue;

      for (
        let start = 0;
        start <= tokens.length - aliasTokens.length;
        start += 1
      ) {
        const slice = normalizedTokens.slice(start, start + aliasTokens.length);
        if (slice.join(" ") === aliasTokens.join(" ")) {
          for (let offset = 0; offset < aliasTokens.length; offset += 1) {
            used[start + offset] = true;
          }
          foundNames.push(player.name);
        }
      }
    }
  }

  return { used, foundNames };
}

function extractTeamSheetNames(text: string, roster: RoomPlayer[]) {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);
  const names: string[] = [];
  let inTeamSection = false;

  for (const line of lines) {
    const normalized = normalizeForMatch(line);

    if (/\bteam\s+\d\b/.test(normalized)) {
      inTeamSection = true;
      continue;
    }

    if (!inTeamSection) continue;
    if (
      /\b(cancel|add all|fair teams|today s teams|today teams|tuesday|wednesday|thursday|friday|saturday|sunday|monday|june|july|august|ocr|import)\b/.test(
        normalized,
      )
    ) {
      continue;
    }

    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 6) continue;

    const { used, foundNames } = findRosterAliasesInTokens(tokens, roster);
    names.push(...foundNames);

    let group: string[] = [];
    const flushGroup = () => {
      if (!group.length) return;
      const candidate = cleanOcrLine(group.join(" "));
      const normalizedCandidate = normalizeForMatch(candidate);
      if (
        candidate &&
        isProbablyName(candidate) &&
        !OCR_JUNK_WORDS.has(normalizedCandidate)
      ) {
        names.push(candidate);
      }
      group = [];
    };

    tokens.forEach((token, index) => {
      if (used[index]) {
        flushGroup();
      } else {
        group.push(token);
      }
    });
    flushGroup();
  }

  return names;
}

function hasRosterSignal(value: string, roster: RoomPlayer[]) {
  const normalized = normalizeForMatch(value);
  if (!normalized) return false;
  return roster.some((player) => {
    const rankedScore = scorePlayerMatch(value, player);
    return (
      playerSearchNames(player).includes(normalized) ||
      rankedScore >= (normalized.split(" ").length === 1 ? 95 : 88)
    );
  });
}

function isProbablyName(value: string) {
  const clean = cleanOcrLine(value);
  const normalized = normalizeForMatch(clean);
  if (!normalized) return false;
  if (OCR_JUNK_WORDS.has(normalized)) return false;
  if (
    [...OCR_JUNK_WORDS].some(
      (word) =>
        normalized.includes(word) && normalized.length <= word.length + 8,
    )
  )
    return false;
  if (/\d/.test(clean)) return false;
  if (clean.length < 3 || clean.length > 36) return false;
  if (
    /\b(i|we|you|he|she|they|it|this|that|but|would|like|come|join|plan|moved|time|thing|attend|club|anymore|gathering|question|list|event|search|checked|attendees?)\b/i.test(
      clean,
    )
  )
    return false;
  if (/^[A-Z\s]{4,}$/.test(clean) && clean.split(/\s+/).length > 1)
    return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (words.some((word) => word.length === 1 && words.length > 1)) return false;
  return true;
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLength = Math.max(a.length, b.length);
  return Math.round((1 - levenshtein(a, b) / maxLength) * 100);
}

function playerSearchNames(player: RoomPlayer) {
  const values = [player.name, player.aka, displayName(player)];
  const aka = player.aka?.trim();
  if (aka) {
    values.push(`${player.name} ${aka}`);
    values.push(`${aka} ${player.name}`);
  }

  return Array.from(
    new Set(
      values
        .filter(Boolean)
        .map((value) => normalizeForMatch(String(value)))
        .filter(Boolean),
    ),
  );
}

function scorePlayerMatch(ocrName: string, player: RoomPlayer) {
  const normalizedOcr = normalizeForMatch(ocrName);
  const ocrFirst = normalizedOcr[0];
  if (!ocrFirst) return 0;
  return Math.max(
    ...playerSearchNames(player).map((candidate) => {
      if (!candidate) return 0;
      const ocrWords = normalizedOcr.split(" ").filter(Boolean);
      const candidateWords = candidate.split(" ").filter(Boolean);
      const ocrFirstName = ocrWords[0] ?? "";
      const candidateFirstName = candidateWords[0] ?? "";

      // If OCR adds a short junk prefix before a saved one-word roster name
      // (example: "ir Danill"), still match/suggest the real roster player.
      if (candidateWords.length === 1 && candidateFirstName.length >= 4) {
        const bestTokenScore = Math.max(
          0,
          ...ocrWords
            .filter((word) => word.length >= 3)
            .map((word) => similarity(word, candidateFirstName)),
        );
        if (bestTokenScore === 100) return 96;
        if (bestTokenScore >= 90) return 94;
        if (bestTokenScore >= 84) return 88;
      }

      // Meetup screenshots often show full public names while the Fair Teams
      // roster may store nicknames/first names such as "Abou", "Luca", or
      // "Andrew (Daniel)". If the first name is an exact match, treat it as a
      // strong safe match even when the OCR name has extra surname words.
      if (ocrFirstName && ocrFirstName === candidateFirstName) {
        if (normalizedOcr === candidate) return 100;
        return candidateWords.length === 1 ? 96 : 94;
      }

      // Also support last-name / nickname matches. Example: OCR reads
      // "ray Brijesh" but the roster player is saved simply as "Brijesh".
      // Keep this exact-token only, so fuzzy matching does not become too loose.
      if (
        candidateWords.length === 1 &&
        candidateWords[0].length >= 3 &&
        ocrWords.includes(candidateWords[0])
      ) {
        return 95;
      }

      // For normal fuzzy matching, keep the original first-letter guard so
      // unrelated names cannot jump to high scores.
      if (candidate[0] !== ocrFirst) return 0;

      const rawScore = similarity(normalizedOcr, candidate);
      const firstWordScore = similarity(ocrFirstName, candidateFirstName);
      if (firstWordScore < 70) return 0;
      return rawScore;
    }),
  );
}

function extractOcrNames(
  text: string,
  roster: RoomPlayer[],
): OcrNameCandidate[] {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);
  const names: string[] = [];

  names.push(...extractInlineMeetupNames(text));
  names.push(...extractTeamSheetNames(text, roster));

  for (let index = 0; index < lines.length; index += 1) {
    const current = normalizeForMatch(lines[index]);
    if (
      current === "member" ||
      current === "event host" ||
      current.includes("member")
    ) {
      for (let back = index - 1; back >= Math.max(0, index - 3); back -= 1) {
        if (isProbablyName(lines[back])) {
          names.push(cleanOcrLine(lines[back]));
          break;
        }
      }
    }
  }

  // Conservative fallback: only keep standalone lines when they strongly match
  // someone already in the roster. This avoids OCR status-bar/UI junk such as
  // "MO BE EN", "NESW", filenames, and free-text RSVP comments.
  for (const line of lines) {
    if (isProbablyName(line) && hasRosterSignal(line, roster)) {
      names.push(cleanOcrLine(line));
    }
  }

  // Roster rescue pass: if OCR clearly contains a saved roster name anywhere
  // in the full text, add that player even when the Meetup line structure was
  // missed. This catches short names like "Joon" that are visible in raw OCR
  // but can be skipped by the Member/Event host pattern.
  const normalizedFullText = ` ${normalizeForMatch(text)} `;
  for (const player of roster) {
    const searchNames = playerSearchNames(player).filter(Boolean);
    for (const searchName of searchNames) {
      if (searchName.length < 3) continue;
      const safePattern = new RegExp(
        `(^|\\s)${searchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`,
      );
      if (safePattern.test(normalizedFullText)) {
        names.push(player.name);
        break;
      }
    }
  }

  const uniqueNames = Array.from(
    new Map(names.map((name) => [normalizeForMatch(name), name])).values(),
  );

  const candidates = uniqueNames.map((name) => {
    const normalized = normalizeForMatch(name);
    const wordCount = normalized.split(" ").filter(Boolean).length;
    const ranked = roster
      .map((player) => ({ player, score: scorePlayerMatch(name, player) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const exactMatches = ranked.filter((match) =>
      playerSearchNames(match.player).includes(normalized),
    );
    const matchThreshold = wordCount === 1 ? 95 : 88;
    const suggestThreshold = wordCount === 1 ? 78 : 72;

    if (exactMatches.length === 1) {
      return {
        name,
        status: "match" as const,
        bestMatch: exactMatches[0].player,
        score: 100,
        suggestions: ranked.slice(0, 3),
      };
    }

    if (exactMatches.length > 1) {
      return {
        name,
        status: "suggest" as const,
        bestMatch: exactMatches[0].player,
        score: 100,
        suggestions: exactMatches.slice(0, 3),
      };
    }

    if (best && best.score >= matchThreshold) {
      const strongMatches = ranked.filter(
        (match) =>
          match.score >= matchThreshold &&
          Math.abs(match.score - best.score) <= 2,
      );
      if (strongMatches.length > 1) {
        return {
          name,
          status: "suggest" as const,
          bestMatch: best.player,
          score: best.score,
          suggestions: strongMatches.slice(0, 3),
        };
      }

      return {
        name,
        status: "match" as const,
        bestMatch: best.player,
        score: best.score,
        suggestions: ranked.slice(0, 3),
      };
    }

    if (best && best.score >= suggestThreshold) {
      return {
        name,
        status: "suggest" as const,
        bestMatch: best.player,
        score: best.score,
        suggestions: ranked.slice(0, 3),
      };
    }

    return { name, status: "new" as const, suggestions: ranked.slice(0, 3) };
  });

  // Screenshots often overlap. Dedupe after matching, not just by OCR text:
  // several different OCR strings can point to the same roster player.
  const byFinalIdentity = new Map<string, OcrNameCandidate>();
  const statusRank: Record<OcrMatchStatus, number> = {
    match: 3,
    suggest: 2,
    new: 1,
  };

  for (const candidate of candidates) {
    const key = candidate.bestMatch
      ? `roster:${candidate.bestMatch.id}`
      : `new:${normalizeForMatch(candidate.name)}`;
    const existing = byFinalIdentity.get(key);

    if (!existing) {
      byFinalIdentity.set(key, candidate);
      continue;
    }

    const candidateScore = candidate.score ?? 0;
    const existingScore = existing.score ?? 0;
    const candidateRank = statusRank[candidate.status];
    const existingRank = statusRank[existing.status];

    // Keep the safest/best version of duplicate findings. Prefer MATCH over
    // CHECK, then higher score, then the cleaner/shorter displayed OCR name.
    if (
      candidateRank > existingRank ||
      (candidateRank === existingRank && candidateScore > existingScore) ||
      (candidateRank === existingRank &&
        candidateScore === existingScore &&
        candidate.name.length < existing.name.length)
    ) {
      byFinalIdentity.set(key, candidate);
    }
  }

  return Array.from(byFinalIdentity.values());
}

export function TodayTab({
  players,
  setPlayers,
  themeColor = "#3B82F6",
}: {
  players: RoomPlayer[];
  setPlayers: (players: RoomPlayer[]) => void;
  themeColor?: string;
}) {
  const [search, setSearch] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [selectedScreenshots, setSelectedScreenshots] = useState<File[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [confirmNewPlayersOpen, setConfirmNewPlayersOpen] = useState(false);
  const [confirmAddAllOpen, setConfirmAddAllOpen] = useState(false);
  const [expectedAttendeeCount, setExpectedAttendeeCount] = useState("");
  const [showRawOcrText, setShowRawOcrText] = useState(false);
  const [prioritizeScannedPlayers, setPrioritizeScannedPlayers] =
    useState(false);

  const attendingSummaryStyle = {
    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)",
  } as React.CSSProperties;
  const [selectedScreenshotPreviews, setSelectedScreenshotPreviews] = useState<
    Array<{ name: string; url: string }>
  >([]);

  const sorted = [...players].sort((a, b) => {
    if (
      prioritizeScannedPlayers &&
      Boolean(a.attending) !== Boolean(b.attending)
    ) {
      return a.attending ? -1 : 1;
    }
    return displayName(a).localeCompare(displayName(b));
  });
  const filtered = search.trim()
    ? sorted.filter((p) =>
        displayName(p).toLowerCase().includes(search.toLowerCase()),
      )
    : sorted;

  const selectedCount = players.filter((p) => p.attending).length;

  const selectedScreenshotNames = selectedScreenshots.map((file) => file.name);

  useEffect(() => {
    const previews = selectedScreenshots.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setSelectedScreenshotPreviews(previews);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [selectedScreenshots]);
  const possibleNames = useMemo(
    () => (ocrText ? extractOcrNames(ocrText, players) : []),
    [ocrText, players],
  );
  const [selectedOcrCandidateKeys, setSelectedOcrCandidateKeys] = useState<
    string[]
  >([]);
  const [chosenOcrMatchIds, setChosenOcrMatchIds] = useState<
    Record<string, string>
  >({});
  const selectedOcrCandidateKeySet = new Set(selectedOcrCandidateKeys);

  const resolveOcrMatch = (candidate: OcrNameCandidate) => {
    const chosenPlayerId = chosenOcrMatchIds[ocrCandidateKey(candidate)];
    if (chosenPlayerId) {
      const chosenPlayer = players.find(
        (player) => player.id === chosenPlayerId,
      );
      if (chosenPlayer) return chosenPlayer;
    }
    return candidate.bestMatch;
  };

  const safeMatches = possibleNames.filter(
    (candidate) => candidate.status === "match",
  ).length;
  const suggestions = possibleNames.filter(
    (candidate) => candidate.status === "suggest",
  ).length;
  const newNames = possibleNames.filter(
    (candidate) => candidate.status === "new",
  ).length;
  const selectedOcrCandidates = possibleNames.filter((candidate) =>
    selectedOcrCandidateKeySet.has(ocrCandidateKey(candidate)),
  );
  const selectedRosterMatches = selectedOcrCandidates.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const selectedNewCandidates = selectedOcrCandidates.filter(
    (candidate) => candidate.status === "new" && !resolveOcrMatch(candidate),
  );
  const selectedOcrTotal =
    selectedRosterMatches.length + selectedNewCandidates.length;
  const allRosterCandidates = possibleNames.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const allNewCandidates = possibleNames.filter(
    (candidate) => candidate.status === "new" && !resolveOcrMatch(candidate),
  );
  const allOcrTotal = allRosterCandidates.length + allNewCandidates.length;
  const allCheckCandidates = possibleNames.filter(
    (candidate) => candidate.status === "suggest",
  );
  const expectedAttendeeNumber = Number(expectedAttendeeCount);
  const hasExpectedAttendeeNumber =
    expectedAttendeeCount.trim() !== "" &&
    Number.isFinite(expectedAttendeeNumber) &&
    expectedAttendeeNumber > 0;
  const scannedNameCount = possibleNames.length;
  const rosterMatchCount = allRosterCandidates.length;
  const unmatchedScannedNames = allNewCandidates;
  const missingFromScan = hasExpectedAttendeeNumber
    ? Math.max(0, Math.round(expectedAttendeeNumber) - scannedNameCount)
    : 0;

  const openOcrImport = () => {
    // Screenshot scan is a fresh attendance workflow, so start Today from empty
    // instead of accidentally keeping last week's selected players.
    setPrioritizeScannedPlayers(false);
    setPlayers(players.map((player) => ({ ...player, attending: false })));
    setOcrOpen(true);
  };

  useEffect(() => {
    setSelectedOcrCandidateKeys(
      possibleNames
        .filter(
          (candidate) => candidate.status === "match" && candidate.bestMatch,
        )
        .map(ocrCandidateKey),
    );
  }, [possibleNames]);

  const clearOcrSelection = () => {
    setSelectedScreenshots([]);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("");
    setSelectedOcrCandidateKeys([]);
    setChosenOcrMatchIds({});
    setExpectedAttendeeCount("");
    setShowRawOcrText(false);
  };

  const runOcr = async () => {
    if (selectedScreenshots.length === 0 || ocrRunning) return;

    setOcrRunning(true);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("Starting scan…");

    const chunks: string[] = [];

    try {
      for (let index = 0; index < selectedScreenshots.length; index += 1) {
        const file = selectedScreenshots[index];
        setOcrStatus(
          `Reading ${index + 1} of ${selectedScreenshots.length}: ${file.name}`,
        );

        const result = await Tesseract.recognize(file, "eng", {
          logger: (message) => {
            if (message.status)
              setOcrStatus(
                `${message.status} (${index + 1}/${selectedScreenshots.length})`,
              );
            if (typeof message.progress === "number") {
              const imageShare = 1 / selectedScreenshots.length;
              const completedShare = index / selectedScreenshots.length;
              setOcrProgress(
                Math.round(
                  (completedShare + message.progress * imageShare) * 100,
                ),
              );
            }
          },
        });

        chunks.push(`--- ${file.name} ---\n${result.data.text.trim()}`);
      }

      setOcrText(chunks.join("\n\n"));
      setOcrProgress(100);
      setOcrStatus("Scan complete. Review names below.");
    } catch (error) {
      console.error(error);
      setOcrStatus("Scan failed. Try a clearer screenshot or fewer images.");
    } finally {
      setOcrRunning(false);
    }
  };

  const toggleOcrCandidate = (candidate: OcrNameCandidate) => {
    const key = ocrCandidateKey(candidate);
    setSelectedOcrCandidateKeys((current) =>
      current.includes(key)
        ? current.filter((candidateKey) => candidateKey !== key)
        : [...current, key],
    );
  };

  const chooseOcrSuggestion = (
    candidate: OcrNameCandidate,
    player: RoomPlayer,
  ) => {
    const key = ocrCandidateKey(candidate);
    setChosenOcrMatchIds((current) => ({ ...current, [key]: player.id }));
    setSelectedOcrCandidateKeys((current) =>
      current.includes(key) ? current : [...current, key],
    );
  };

  const finalizeOcrCandidates = (candidatesToAdd: OcrNameCandidate[]) => {
    const currentRosterMatches = candidatesToAdd
      .map((candidate) => resolveOcrMatch(candidate))
      .filter(Boolean) as RoomPlayer[];
    const currentNewCandidates = candidatesToAdd.filter(
      (candidate) => candidate.status === "new" && !resolveOcrMatch(candidate),
    );

    const playerIds = new Set(currentRosterMatches.map((player) => player.id));

    if (playerIds.size === 0 && currentNewCandidates.length === 0) return;

    const now = new Date().toISOString();
    const newPlayers: RoomPlayer[] = currentNewCandidates.map((candidate) => ({
      id: createOcrPlayerId(),
      roomId: 1,
      name: candidate.name.trim(),
      gender: "male",
      skill: 5,
      attack: 5,
      defense: 5,
      speed: 5,
      passing: 5,
      stamina: 5,
      physical: 5,
      teamPlay: 2,
      isNew: true,
      attending: true,
      createdAt: now,
      updatedAt: now,
    }));

    const nextPlayers = [
      ...players.map((player) =>
        playerIds.has(player.id) ? { ...player, attending: true } : player,
      ),
      ...newPlayers,
    ].sort((a, b) => displayName(a).localeCompare(displayName(b)));

    setPrioritizeScannedPlayers(true);
    setPlayers(nextPlayers);
    setOcrStatus(
      `Added ${playerIds.size} existing player${playerIds.size === 1 ? "" : "s"} and created ${newPlayers.length} new player${newPlayers.length === 1 ? "" : "s"}.`,
    );
    setConfirmNewPlayersOpen(false);
    setConfirmAddAllOpen(false);
    setOcrOpen(false);
  };

  const finalizeAddSelectedOcrMatches = () => {
    finalizeOcrCandidates(selectedOcrCandidates);
  };

  const finalizeAddAllOcrMatches = () => {
    finalizeOcrCandidates(possibleNames);
  };

  const addSelectedOcrMatches = () => {
    if (selectedOcrTotal === 0) return;
    if (selectedNewCandidates.length > 0) {
      setConfirmNewPlayersOpen(true);
      return;
    }
    finalizeAddSelectedOcrMatches();
  };

  const addAllOcrMatches = () => {
    if (allOcrTotal === 0) return;
    setConfirmAddAllOpen(true);
  };

  const togglePlayer = (player: RoomPlayer) => {
    setPlayers(
      players.map((p) =>
        p.id === player.id ? { ...p, attending: !p.attending } : p,
      ),
    );
  };

  if (players.length === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-250px)] items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground font-medium">
          Add players in the Roster tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center justify-between rounded-xl border p-3 shadow-sm"
        style={attendingSummaryStyle}
      >
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">
            Attending Today
          </span>
          <span className="text-lg font-black leading-tight text-slate-900">
            {selectedCount}{" "}
            <span className="text-xs font-semibold text-slate-500">
              / {players.length}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPrioritizeScannedPlayers(false);
              setPlayers(players.map((p) => ({ ...p, attending: true })));
            }}
            className="h-7 bg-white/75 px-2 text-[10px] font-black uppercase text-slate-700 hover:bg-white"
          >
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPrioritizeScannedPlayers(false);
              setPlayers(players.map((p) => ({ ...p, attending: false })));
            }}
            className="h-7 bg-white/60 px-2 text-[10px] font-black uppercase text-slate-500 hover:bg-white hover:text-slate-700"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openOcrImport}
          className="h-9 rounded-xl text-xs font-black"
          data-testid="ocr-import-button"
        >
          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
          Screenshot Import
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVoiceOpen(true)}
          className="h-9 rounded-xl text-xs font-black"
          data-testid="voice-import-button"
        >
          <Mic className="mr-1.5 h-3.5 w-3.5" />
          Voice Import
        </Button>
      </div>

      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex h-[90dvh] max-h-[90dvh] w-[94vw] max-w-lg md:max-w-3xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Screenshot Import
            </DialogTitle>
            <DialogDescription className="text-xs">
              Import today's attendees from a Meetup, WhatsApp, Telegram, or
              list screenshot.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-2">
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center transition-colors hover:bg-muted/70">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-xs font-black text-foreground">
                {selectedScreenshotNames.length > 0
                  ? `${selectedScreenshotNames.length} screenshot${selectedScreenshotNames.length === 1 ? "" : "s"} selected`
                  : "Upload Screenshot(s)"}
              </div>
              <div className="text-[10px] font-medium text-muted-foreground">
                Select all screenshots for one attendee list. You can select
                multiple screenshots from one attendee list.
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  setSelectedScreenshots(Array.from(event.target.files ?? []));
                  setOcrText("");
                  setOcrProgress(0);
                  setOcrStatus("");
                  setSelectedOcrCandidateKeys([]);
                  setChosenOcrMatchIds({});
                  setShowRawOcrText(false);
                }}
                data-testid="ocr-file-input"
              />
            </label>

            {selectedScreenshotPreviews.length > 0 && (
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Uploaded screenshots
                    </div>
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Check these before scanning.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearOcrSelection}
                    className="h-7 px-2 text-[10px] font-black"
                  >
                    Clear
                  </Button>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {selectedScreenshotPreviews.map((preview, index) => (
                    <div
                      key={`${preview.name}-${index}`}
                      className="overflow-hidden rounded-lg border bg-muted/40"
                    >
                      <img
                        src={preview.url}
                        alt={`Screenshot ${index + 1}`}
                        className="h-24 w-full object-cover object-top"
                      />
                      <div className="truncate px-1.5 py-1 text-[9px] font-bold text-muted-foreground">
                        {index + 1}. {preview.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(ocrRunning || ocrStatus) && (
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Scan Status
                  </div>
                  <div className="text-[10px] font-black text-muted-foreground">
                    {ocrProgress}%
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] font-medium text-muted-foreground">
                  {ocrStatus}
                </div>
              </div>
            )}

            {ocrText && (
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Scan Audit
                  </div>
                  {hasExpectedAttendeeNumber && (
                    <div
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        missingFromScan > 0
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {missingFromScan > 0
                        ? `${missingFromScan} missing`
                        : "complete"}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <div className="text-[10px] font-black uppercase text-muted-foreground">
                      Expected
                    </div>
                    <div className="text-lg font-black text-foreground">
                      {hasExpectedAttendeeNumber
                        ? Math.round(expectedAttendeeNumber)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <div className="text-[10px] font-black uppercase text-muted-foreground">
                      Scanned
                    </div>
                    <div className="text-lg font-black text-foreground">
                      {scannedNameCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <div className="text-[10px] font-black uppercase text-emerald-700">
                      Roster matches
                    </div>
                    <div className="text-lg font-black text-emerald-800">
                      {rosterMatchCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-sky-50 p-2">
                    <div className="text-[10px] font-black uppercase text-sky-700">
                      Not in roster
                    </div>
                    <div className="text-lg font-black text-sky-800">
                      {unmatchedScannedNames.length}
                    </div>
                  </div>
                </div>

                {hasExpectedAttendeeNumber && missingFromScan > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-bold text-amber-800">
                    Scan found {scannedNameCount} name
                    {scannedNameCount === 1 ? "" : "s"}, but you expected{" "}
                    {Math.round(expectedAttendeeNumber)}. Check the screenshot
                    or add {missingFromScan} missing player
                    {missingFromScan === 1 ? "" : "s"} manually.
                  </div>
                )}

                {unmatchedScannedNames.length > 0 && (
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
                    <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-sky-800">
                      Scanned but not in roster
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {unmatchedScannedNames.map((candidate) => (
                        <span
                          key={ocrCandidateKey(candidate)}
                          className="rounded-full bg-card px-2 py-1 text-[10px] font-black text-sky-800 ring-1 ring-sky-100"
                        >
                          {candidate.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {ocrText && (
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Review Names
                  </div>
                  {possibleNames.length > 0 && (
                    <div className="text-[10px] font-black text-muted-foreground">
                      {safeMatches} match · {suggestions} check · {newNames} new
                    </div>
                  )}
                </div>
                {possibleNames.length > 0 ? (
                  <div className="space-y-2 pr-1">
                    {possibleNames.map((candidate, index) => {
                      const candidateKey = ocrCandidateKey(candidate);
                      const isSelectedMatch =
                        selectedOcrCandidateKeySet.has(candidateKey);
                      const resolvedMatch = resolveOcrMatch(candidate);

                      return (
                        <div
                          key={`${candidate.name}-${index}`}
                          className={`rounded-lg p-2.5 text-[11px] ${
                            isSelectedMatch
                              ? "bg-primary/10 ring-1 ring-primary/20"
                              : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 gap-2">
                              <Checkbox
                                checked={isSelectedMatch}
                                onCheckedChange={() =>
                                  toggleOcrCandidate(candidate)
                                }
                                className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                              />
                              <div className="min-w-0">
                                <div className="font-black text-foreground">
                                  {candidate.name}
                                </div>
                                {candidate.status === "match" &&
                                  resolvedMatch && (
                                    <div className="mt-0.5 font-medium text-emerald-700">
                                      MATCH: {displayName(resolvedMatch)} ·{" "}
                                      {candidate.score}%
                                    </div>
                                  )}
                                {candidate.status === "suggest" &&
                                  resolvedMatch && (
                                    <div className="mt-0.5 font-medium text-amber-700">
                                      SELECTED: {displayName(resolvedMatch)} ·{" "}
                                      {candidate.score}%
                                    </div>
                                  )}
                                {candidate.status === "new" && (
                                  <div className="mt-0.5 font-medium text-sky-700">
                                    {resolvedMatch
                                      ? `SELECTED: ${displayName(resolvedMatch)}`
                                      : "NEW: Will create roster player if selected"}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                candidate.status === "match"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : candidate.status === "suggest"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {candidate.status === "match"
                                ? "MATCH"
                                : candidate.status === "suggest"
                                  ? "CHECK"
                                  : "NEW"}
                            </div>
                          </div>
                          {candidate.status !== "match" &&
                            candidate.suggestions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {candidate.suggestions
                                  .slice(0, 3)
                                  .map(({ player, score }) => {
                                    const isChosen =
                                      resolvedMatch?.id === player.id;
                                    return (
                                      <button
                                        key={player.id}
                                        type="button"
                                        onClick={() =>
                                          chooseOcrSuggestion(candidate, player)
                                        }
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                          isChosen
                                            ? "bg-amber-100 text-amber-900 border-amber-300"
                                            : "bg-card text-muted-foreground"
                                        }`}
                                      >
                                        {isChosen ? "✓ " : "Use "}
                                        {displayName(player)} {score}%
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/50 p-3 text-center text-xs font-medium text-muted-foreground">
                    Screenshot Import will show filtered possible names here.
                  </div>
                )}
              </div>
            )}

            {ocrText && (
              <div className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Advanced
                    </div>
                    <div className="text-[10px] font-medium text-muted-foreground">
                      Raw scan text is mainly for troubleshooting.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRawOcrText((value) => !value)}
                    className="h-7 px-2 text-[10px] font-black"
                  >
                    {showRawOcrText ? "Hide raw text" : "Show raw text"}
                  </Button>
                </div>
                {showRawOcrText && (
                  <pre className="mt-2 max-h-48 whitespace-pre-wrap overflow-y-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-foreground">
                    {ocrText}
                  </pre>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-3 sm:gap-2">
            {!ocrText ? (
              <div className="w-full space-y-2">
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <div>
                    <label
                      htmlFor="expected-attendee-count"
                      className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground"
                    >
                      Expected attendees today
                      <span className="font-bold normal-case tracking-normal text-muted-foreground/80">
                        {" "}
                        (optional)
                      </span>
                    </label>
                    <Input
                      id="expected-attendee-count"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={expectedAttendeeCount}
                      onChange={(event) =>
                        setExpectedAttendeeCount(event.target.value)
                      }
                      placeholder="Example: 18"
                      className="h-10 rounded-xl text-sm font-bold"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={runOcr}
                    disabled={selectedScreenshots.length === 0 || ocrRunning}
                    className="h-10 rounded-xl px-4 text-xs font-black"
                  >
                    {ocrRunning ? "Scanning…" : "Screenshot Import"}
                  </Button>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  This footer stays fixed while you review uploaded screenshots.
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOcrOpen(false)}
                  className="h-9 shrink-0 rounded-xl px-3 text-xs font-bold whitespace-nowrap"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addAllOcrMatches}
                  disabled={allOcrTotal === 0}
                  className="h-9 shrink-0 rounded-xl px-3 text-xs font-black whitespace-nowrap"
                >
                  Add All ({allOcrTotal})
                </Button>
                <Button
                  type="button"
                  onClick={addSelectedOcrMatches}
                  disabled={selectedOcrTotal === 0}
                  className="h-9 min-w-0 flex-1 rounded-xl px-3 text-xs font-black whitespace-nowrap"
                >
                  Add Selected ({selectedOcrTotal})
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmNewPlayersOpen}
        onOpenChange={setConfirmNewPlayersOpen}
      >
        <DialogContent className="w-[92vw] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Create New Players?
            </DialogTitle>
            <DialogDescription className="text-xs">
              These scan names are not in your roster yet. Create them with
              default ratings and add them to Today?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-muted/40 p-3">
            {selectedNewCandidates.map((candidate) => (
              <div
                key={ocrCandidateKey(candidate)}
                className="rounded-lg bg-card px-3 py-2 text-xs font-black text-foreground"
              >
                {candidate.name}
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-sky-50 p-3 text-[11px] font-medium text-sky-800 border border-sky-100">
            New players will start with default ratings and the NEW badge. You
            can edit them later in the Roster tab.
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmNewPlayersOpen(false)}
              className="h-9 text-xs font-bold"
            >
              No, go back
            </Button>
            <Button
              type="button"
              onClick={finalizeAddSelectedOcrMatches}
              className="h-9 text-xs font-black"
            >
              Yes, create and add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAddAllOpen} onOpenChange={setConfirmAddAllOpen}>
        <DialogContent className="w-[92vw] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Add All Scan Results?
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will add every detected scan result, including unchecked
              CHECK suggestions and NEW players.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-xs">
            <div className="flex justify-between gap-3 font-bold">
              <span>Safe matches</span>
              <span>{safeMatches}</span>
            </div>
            <div className="flex justify-between gap-3 font-bold text-amber-700">
              <span>CHECK suggestions</span>
              <span>{allCheckCandidates.length}</span>
            </div>
            <div className="flex justify-between gap-3 font-bold text-sky-700">
              <span>New players to create</span>
              <span>{allNewCandidates.length}</span>
            </div>
            {hasExpectedAttendeeNumber && (
              <div className="flex justify-between gap-3 font-bold text-muted-foreground">
                <span>Missing from scan</span>
                <span>{missingFromScan}</span>
              </div>
            )}
          </div>
          {(allCheckCandidates.length > 0 || allNewCandidates.length > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800">
              Review carefully: CHECK names use the suggested roster match, and
              NEW names will be created with default ratings.
            </div>
          )}
          {allNewCandidates.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border bg-muted/40 p-3">
              <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                New Players
              </div>
              {allNewCandidates.map((candidate) => (
                <div
                  key={ocrCandidateKey(candidate)}
                  className="rounded-lg bg-card px-3 py-2 text-xs font-black text-foreground"
                >
                  {candidate.name}
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAddAllOpen(false)}
              className="h-9 text-xs font-bold"
            >
              No, go back
            </Button>
            <Button
              type="button"
              onClick={finalizeAddAllOcrMatches}
              className="h-9 text-xs font-black"
            >
              Yes, add all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="w-[92vw] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Voice Import
            </DialogTitle>
            <DialogDescription className="text-xs">
              Voice roll call will come later. Screenshot scan comes first.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/50 p-4 text-center text-xs font-medium text-muted-foreground">
            Coming soon.
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setVoiceOpen(false)}
              className="h-9 text-xs font-black"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 pr-8 text-xs"
          data-testid="today-search"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 bg-muted/50 rounded-xl border border-dashed border-border">
          <p className="text-muted-foreground font-medium text-xs">
            No players match "{search}"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {filtered.map((player) => (
            <label
              key={player.id}
              className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${player.attending ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              data-testid={`attendance-row-${player.id}`}
            >
              <Checkbox
                checked={!!player.attending}
                onCheckedChange={() => togglePlayer(player)}
                className="w-4 h-4 rounded-full border-2 shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                data-testid={`attendance-check-${player.id}`}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <div
                  className={`font-bold text-xs truncate leading-tight ${player.attending ? "text-primary" : "text-foreground"}`}
                >
                  {displayName(player)}
                </div>
                <div className="mt-0.5 flex items-center gap-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                    OVR {player.skill}
                  </span>
                  {(player.isNew ||
                    player.isGoalkeeper ||
                    player.isOrganizer) && (
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {player.isNew && <NewBadge />}
                      {player.isGoalkeeper && <GKBadge />}
                      {player.isOrganizer && <ORGBadge />}
                    </div>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

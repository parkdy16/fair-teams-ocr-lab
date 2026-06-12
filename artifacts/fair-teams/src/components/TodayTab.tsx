import React, { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import type { RoomPlayer } from "@/lib/localRoster";
import type { Gender } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Image as ImageIcon, Mic, Search, Upload, X } from "lucide-react";
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

function isNotHereYet(player: Pick<RoomPlayer, "todayStatus">) {
  return player.todayStatus === "not_here_yet";
}

function NotHereBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 border border-amber-200">
      Not here yet
    </span>
  );
}


type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
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
  "ok",
  "okay",
  "understood",
  "of course",
  "i'm both",
  "im both",
  "you know me",
  "good vibes",
  "good vibes guaranteed",
  "goals not so much",
  "i think i got well into both categories",
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const MEETUP_COMMENT_WORDS = new Set([
  "ok",
  "okay",
  "yes",
  "no",
  "maybe",
  "ja",
  "na",
  "understood",
  "of course",
  "i'm both",
  "im both",
  "you know me",
  "good vibes guaranteed goals not so much",
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

function isMeetupCommentLine(value: string) {
  const normalized = normalizeForMatch(value);
  if (!normalized) return true;
  if (OCR_JUNK_WORDS.has(normalized)) return true;
  if (MEETUP_STOP_WORDS.has(normalized.replace(/\s+/g, ""))) return true;
  if (normalized.split(" ").some((word) => MEETUP_STOP_WORDS.has(word))) {
    return true;
  }
  return MEETUP_COMMENT_WORDS.has(normalized);
}

function shouldUseMeetupAdjacentName(value: string) {
  const clean = cleanOcrLine(value);
  if (!clean || isMeetupCommentLine(clean)) return false;
  return isProbablyName(clean) || isProbablySingleUsername(clean);
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

function speechSoundKey(value: string) {
  return normalizeForMatch(value)
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/x/g, "ks")
    .split(" ")
    .map((word) => {
      const compact = word.replace(/[^a-z0-9]/g, "");
      if (compact.length <= 2) return compact;
      const first = compact[0];
      const rest = compact
        .slice(1)
        .replace(/[aeiouy]+/g, "")
        .replace(/(.)\1+/g, "$1");
      return `${first}${rest}`;
    })
    .filter(Boolean)
    .join(" ");
}

function speechSoundSimilarity(a: string, b: string) {
  const aKey = speechSoundKey(a);
  const bKey = speechSoundKey(b);
  if (!aKey || !bKey) return 0;
  if (aKey === bKey) return 88;
  const score = similarity(aKey, bKey);
  return score >= 80 ? Math.min(87, score) : 0;
}

function voiceNameAlternates(name: string) {
  const normalized = normalizeForMatch(name);
  const alternatesByName: Record<string, string[]> = {
    george: ["Jorge"],
    jorge: ["George"],
    yan: ["Jan"],
    jan: ["Yan"],
    yann: ["Jan"],
    jaan: ["Jan"],
    andrew: ["Andrea"],
    andrea: ["Andrew"],
    june: ["Joon"],
    joon: ["June"],
    philip: ["Phillip", "Filip", "Fillip"],
    phillip: ["Philip", "Filip", "Fillip"],
    filip: ["Philip", "Phillip", "Fillip"],
    fillip: ["Philip", "Phillip", "Filip"],
  };

  return alternatesByName[normalized] ?? [];
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

      const speechScore = speechSoundSimilarity(normalizedOcr, candidate);
      const firstWordSoundScore = speechSoundSimilarity(ocrFirstName, candidateFirstName);
      if (speechScore >= 88 || firstWordSoundScore >= 88) {
        return Math.max(speechScore, firstWordSoundScore, 84);
      }

      // For normal fuzzy matching, keep the original first-letter guard so
      // unrelated names cannot jump to high scores.
      if (candidate[0] !== ocrFirst) return 0;

      const rawScore = similarity(normalizedOcr, candidate);
      const firstWordScore = similarity(ocrFirstName, candidateFirstName);
      if (firstWordScore < 70) return 0;
      return Math.max(rawScore, speechScore);
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
    const isMeetupRoleLine =
      current === "member" ||
      current === "event host" ||
      /^member\b/.test(current) ||
      /^event host\b/.test(current);

    if (isMeetupRoleLine) {
      // Meetup attendee blocks are normally:
      //   Name
      //   Member/Event host
      //   optional RSVP comment
      // So the line before the role marker is the safest source. Keep this
      // local to Meetup-style screenshots so generic OCR remains conservative.
      for (let back = index - 1; back >= Math.max(0, index - 2); back -= 1) {
        const previous = lines[back];
        const previousNormalized = normalizeForMatch(previous);
        if (MEETUP_MARKER_PATTERN.test(previousNormalized)) break;
        if (shouldUseMeetupAdjacentName(previous)) {
          names.push(cleanOcrLine(previous));
          break;
        }
      }

      // Some mobile OCR reads the grey role line before the bold name, e.g.
      // "Member ee" then "Tany". Rescue only very clean next lines, and keep
      // common RSVP comments such as "Understood" blocked.
      const next = lines[index + 1];
      if (next && shouldUseMeetupAdjacentName(next)) {
        names.push(cleanOcrLine(next));
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
        suggestions: ranked.slice(0, 5),
      };
    }

    if (exactMatches.length > 1) {
      return {
        name,
        status: "suggest" as const,
        bestMatch: exactMatches[0].player,
        score: 100,
        suggestions: exactMatches.slice(0, 5),
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
          suggestions: strongMatches.slice(0, 5),
        };
      }

      return {
        name,
        status: "match" as const,
        bestMatch: best.player,
        score: best.score,
        suggestions: ranked.slice(0, 5),
      };
    }

    if (best && best.score >= suggestThreshold) {
      return {
        name,
        status: "suggest" as const,
        bestMatch: best.player,
        score: best.score,
        suggestions: ranked.slice(0, 5),
      };
    }

    return { name, status: "new" as const, suggestions: ranked.slice(0, 5) };
  });

  const expandedCandidates = candidates.flatMap((candidate) => {
    if (candidate.status !== "suggest") return [candidate];

    const closeSuggestions = candidate.suggestions.filter(
      (suggestion) => suggestion.score >= Math.max(78, (candidate.score ?? 0) - 8),
    );

    if (closeSuggestions.length <= 1) return [candidate];

    return closeSuggestions.map((suggestion) => ({
      ...candidate,
      bestMatch: suggestion.player,
      score: suggestion.score,
    }));
  });

  // Screenshots often overlap. Dedupe after matching, not just by OCR text:
  // several different OCR strings can point to the same roster player.
  const byFinalIdentity = new Map<string, OcrNameCandidate>();
  const statusRank: Record<OcrMatchStatus, number> = {
    match: 3,
    suggest: 2,
    new: 1,
  };

  for (const candidate of expandedCandidates) {
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

function splitSpeechChunkIntoNames(text: string, roster: RoomPlayer[]) {
  const output: string[] = [];
  const words = normalizeForMatch(text).split(" ").filter(Boolean);
  const originalWords = cleanOcrLine(text).split(/\s+/).filter(Boolean);

  const rosterAliases = roster
    .flatMap((player) =>
      playerSearchNames(player).map((alias) => ({
        alias,
        tokens: alias.split(" ").filter(Boolean),
        name: player.name,
      })),
    )
    .filter((entry) => entry.alias.length >= 3)
    .sort((a, b) => b.tokens.length - a.tokens.length || b.alias.length - a.alias.length);

  let index = 0;
  while (index < words.length) {
    const exactRosterMatch = rosterAliases.find((entry) => {
      if (entry.tokens.length === 0) return false;
      const slice = words.slice(index, index + entry.tokens.length).join(" ");
      return slice === entry.alias;
    });

    if (exactRosterMatch) {
      output.push(exactRosterMatch.name);
      index += exactRosterMatch.tokens.length;
      continue;
    }

    output.push(originalWords[index] ?? words[index]);
    index += 1;
  }

  return output;
}

function splitVoiceTextIntoNameLines(text: string, roster: RoomPlayer[]) {
  const hasExplicitSeparators = /[,，、;；|/\n\r]/.test(text) || /\s+(?:and|und|그리고|랑|하고)\s+/i.test(text);
  const normalizedSeparators = text
    .replace(/[，、;；|/]+/g, "\n")
    .replace(/\s+(?:and|und|그리고|랑|하고)\s+/gi, "\n")
    .replace(/\r?\n+/g, "\n");

  const output: string[] = [];
  const pushName = (value: string) => {
    const cleaned = cleanOcrLine(value);
    if (!cleaned || !isProbablyName(cleaned)) return;
    const key = normalizeForMatch(cleaned);
    if (!key) return;
    if (!output.some((name) => normalizeForMatch(name) === key)) {
      output.push(cleaned);
    }
  };

  for (const rawLine of normalizedSeparators.split("\n")) {
    const cleanedLine = cleanOcrLine(rawLine);
    if (!cleanedLine) continue;
    const words = normalizeForMatch(cleanedLine).split(" ").filter(Boolean);

    if (!hasExplicitSeparators && words.length > 1) {
      splitSpeechChunkIntoNames(cleanedLine, roster).forEach(pushName);
      continue;
    }

    if (words.length > 4) {
      splitSpeechChunkIntoNames(cleanedLine, roster).forEach(pushName);
      continue;
    }

    pushName(cleanedLine);
  }

  return output;
}

function formatVoiceNameList(names: string[]) {
  const output: string[] = [];
  for (const name of names) {
    const cleaned = cleanOcrLine(name);
    const key = normalizeForMatch(cleaned);
    if (!cleaned || !key || output.some((existing) => normalizeForMatch(existing) === key)) continue;
    output.push(cleaned);
  }
  return output.join(", ");
}

function mergeVoiceNameText(currentText: string, nextNames: string[], roster: RoomPlayer[]) {
  return formatVoiceNameList([
    ...splitVoiceTextIntoNameLines(currentText, roster),
    ...nextNames,
  ]);
}

function makeVoiceTextReviewInput(text: string, roster: RoomPlayer[]) {
  const names = splitVoiceTextIntoNameLines(text, roster);
  const namesWithAlternates: string[] = [];

  for (const name of names) {
    const candidates = [name, ...voiceNameAlternates(name)];
    for (const candidate of candidates) {
      const key = normalizeForMatch(candidate);
      if (!key) continue;
      if (!namesWithAlternates.some((existing) => normalizeForMatch(existing) === key)) {
        namesWithAlternates.push(candidate);
      }
    }
  }

  return namesWithAlternates.map((name) => `${name}\nMember`).join("\n");
}
export function TodayTab({
  players,
  setPlayers,
  themeColor = "#3B82F6",
  openOcrToken = 0,
  ocrImportContext = "today",
  onOcrImportContextChange,
  onAddPlayerManually,
}: {
  players: RoomPlayer[];
  setPlayers: (players: RoomPlayer[]) => void;
  themeColor?: string;
  openOcrToken?: number;
  ocrImportContext?: "today" | "roster";
  onOcrImportContextChange?: (context: "today" | "roster") => void;
  onAddPlayerManually?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceInterimText, setVoiceInterimText] = useState("");
  const [voiceExpectedAttendeeCount, setVoiceExpectedAttendeeCount] = useState("");
  const [quickVoiceOpen, setQuickVoiceOpen] = useState(false);
  const [quickVoiceHeard, setQuickVoiceHeard] = useState("");
  const [quickVoiceListening, setQuickVoiceListening] = useState(false);
  const [quickVoiceStatus, setQuickVoiceStatus] = useState("");
  const quickRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceShouldListenRef = useRef(false);
  const [ocrInputSource, setOcrInputSource] = useState<"screenshot" | "voiceText">("screenshot");
  const [selectedScreenshots, setSelectedScreenshots] = useState<File[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [confirmNewPlayersOpen, setConfirmNewPlayersOpen] = useState(false);
  const [confirmAddAllOpen, setConfirmAddAllOpen] = useState(false);
  const [expectedAttendeeCount, setExpectedAttendeeCount] = useState("");
  const [showRawOcrText, setShowRawOcrText] = useState(false);
  const [manualRawOcrName, setManualRawOcrName] = useState("");
  const [rawOcrAddedNames, setRawOcrAddedNames] = useState<string[]>([]);
  const [rawOcrCreatedPlayerIds, setRawOcrCreatedPlayerIds] = useState<
    string[]
  >([]);
  const [newOcrPlayerGenders, setNewOcrPlayerGenders] = useState<
    Record<string, Gender>
  >({});
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
    if (Boolean(a.attending) !== Boolean(b.attending)) {
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
  const notHereYetCount = players.filter((p) => p.attending && isNotHereYet(p)).length;
  const hereNowCount = selectedCount - notHereYetCount;
  const quickVoiceCandidates = useMemo(() => {
    const spokenName = cleanOcrLine(quickVoiceHeard);
    if (!spokenName) return [] as Array<{ player: RoomPlayer; score: number }>;
    return players
      .map((player) => ({ player, score: scorePlayerMatch(spokenName, player) }))
      .filter((match) => match.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [quickVoiceHeard, players]);

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
  const voiceParsedNames = useMemo(
    () => splitVoiceTextIntoNameLines(voiceText, players),
    [voiceText, players],
  );
  const rawOcrLineEntries = useMemo(() => {
    if (!ocrText) return [];
    const seen = new Set<string>();
    return ocrText
      .split(/\r?\n/)
      .map((line, index) => {
        const cleaned = cleanOcrLine(line);
        const normalizedLine = normalizeForMatch(cleaned);
        if (!cleaned || !normalizedLine) return null;
        if (seen.has(`${index}:${normalizedLine}`)) return null;
        seen.add(`${index}:${normalizedLine}`);

        const foundCandidates = possibleNames.filter((candidate) => {
          const candidateName = normalizeForMatch(candidate.name);
          if (candidateName && normalizedLine.includes(candidateName))
            return true;
          const match = candidate.bestMatch;
          if (!match) return false;
          return playerSearchNames(match).some(
            (searchName) => searchName && normalizedLine.includes(searchName),
          );
        });
        const alreadyPromoted = possibleNames.some(
          (candidate) => normalizeForMatch(candidate.name) === normalizedLine,
        );
        const looksLikeStandaloneName =
          isProbablyName(cleaned) && !alreadyPromoted;

        return {
          index,
          text: cleaned,
          normalized: normalizedLine,
          foundCandidates,
          suggestedName: looksLikeStandaloneName ? cleaned : "",
        };
      })
      .filter(Boolean) as Array<{
      index: number;
      text: string;
      normalized: string;
      foundCandidates: OcrNameCandidate[];
      suggestedName: string;
    }>;
  }, [ocrText, possibleNames]);
  const [selectedOcrCandidateKeys, setSelectedOcrCandidateKeys] = useState<
    string[]
  >([]);
  const [chosenOcrMatchIds, setChosenOcrMatchIds] = useState<
    Record<string, string>
  >({});
  const selectedOcrCandidateKeySet = new Set(selectedOcrCandidateKeys);

  const resolveOcrMatch = (candidate: OcrNameCandidate) => {
    const chosenPlayerId = chosenOcrMatchIds[ocrCandidateKey(candidate)];
    if (chosenPlayerId === "__new__") return undefined;
    if (chosenPlayerId) {
      const chosenPlayer = players.find(
        (player) => player.id === chosenPlayerId,
      );
      if (chosenPlayer) return chosenPlayer;
    }
    return candidate.status === "suggest" ? undefined : candidate.bestMatch;
  };

  const getOcrReviewStatus = (candidate: OcrNameCandidate): OcrMatchStatus => {
    if (chosenOcrMatchIds[ocrCandidateKey(candidate)] === "__new__") return "new";
    const resolvedMatch = resolveOcrMatch(candidate);

    // A player manually CREATED from the raw OCR rescue view immediately becomes
    // a roster match because it now exists in the roster. In the Review Names
    // window, keep showing only those newly-created rows as NEW. Existing roster
    // players clicked from raw OCR should remain MATCH, even if their roster
    // player already has the NEW flag.
    if (
      resolvedMatch &&
      resolvedMatch.isNew &&
      rawOcrCreatedPlayerIds.includes(resolvedMatch.id)
    ) {
      return "new";
    }

    return candidate.status;
  };

  const safeMatches = possibleNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "match",
  ).length;
  const suggestions = possibleNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "suggest",
  ).length;
  const newNames = possibleNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "new",
  ).length;
  const selectedOcrCandidates = possibleNames.filter((candidate) =>
    selectedOcrCandidateKeySet.has(ocrCandidateKey(candidate)),
  );
  const selectedRosterMatches = selectedOcrCandidates.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const selectedNewCandidates = selectedOcrCandidates.filter(
    (candidate) => getOcrReviewStatus(candidate) === "new" && !resolveOcrMatch(candidate),
  );
  const selectedOcrTotal =
    selectedRosterMatches.length + selectedNewCandidates.length;
  const allRosterCandidates = possibleNames.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const allNewCandidates = possibleNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "new" && !resolveOcrMatch(candidate),
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
  const voiceExpectedAttendeeNumber = Number(voiceExpectedAttendeeCount);
  const hasVoiceExpectedAttendeeNumber =
    voiceExpectedAttendeeCount.trim() !== "" &&
    Number.isFinite(voiceExpectedAttendeeNumber) &&
    voiceExpectedAttendeeNumber > 0;
  const voiceCapturedCount = voiceParsedNames.length;
  const voiceMissingCount = hasVoiceExpectedAttendeeNumber
    ? Math.max(0, Math.round(voiceExpectedAttendeeNumber) - voiceCapturedCount)
    : 0;


  const resetImportReviewState = () => {
    setSelectedOcrCandidateKeys([]);
    setChosenOcrMatchIds({});
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("");
    setShowRawOcrText(false);
    setManualRawOcrName("");
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});
  };

  const openOcrImport = () => {
    // Screenshot and Voice/Text are separate attendance workflows.
    // Always start screenshot import from a clean screenshot state so a previous
    // voice list cannot appear inside the screenshot importer.
    setOcrInputSource("screenshot");
    stopVoiceListening();
    setSelectedScreenshots([]);
    setSelectedScreenshotPreviews([]);
    resetImportReviewState();
    setPrioritizeScannedPlayers(false);
    setPlayers(players.map((player) => ({ ...player, attending: false })));
    setOcrOpen(true);
  };

  const openImportChoice = () => {
    openOcrImport();
  };

  const openVoiceImport = () => {
    setOcrInputSource("voiceText");
    setVoiceStatus("");
    setVoiceInterimText("");
    resetImportReviewState();
    setOcrText(makeVoiceTextReviewInput(voiceText, players));
    setVoiceOpen(true);
  };

  const stopVoiceListening = () => {
    voiceShouldListenRef.current = false;
    recognitionRef.current?.stop();
    setVoiceInterimText("");
    setVoiceListening(false);
  };

  const stopQuickVoiceListening = () => {
    quickRecognitionRef.current?.stop();
    setQuickVoiceListening(false);
  };

  const openQuickVoiceSelect = () => {
    stopVoiceListening();
    stopQuickVoiceListening();
    setQuickVoiceHeard("");
    setQuickVoiceStatus("");
    setQuickVoiceOpen(true);
    window.setTimeout(() => startQuickVoiceListening(), 80);
  };

  const startQuickVoiceListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setQuickVoiceStatus("Voice is not supported here. Type a name below.");
      return;
    }
    try {
      setQuickVoiceHeard("");
      setQuickVoiceStatus("Say one player name.");
      navigator.vibrate?.(25);
      quickRecognitionRef.current?.abort?.();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        const transcript = event.results?.[event.resultIndex]?.[0]?.transcript?.trim?.() ?? "";
        setQuickVoiceHeard(transcript);
        setQuickVoiceStatus(transcript ? "Choose the player to select." : "No name heard. Try again or type.");
      };
      recognition.onerror = (event) => {
        setQuickVoiceStatus(event.error ? `Voice stopped: ${event.error}` : "Try again or type a name.");
        setQuickVoiceListening(false);
      };
      recognition.onend = () => setQuickVoiceListening(false);
      quickRecognitionRef.current = recognition;
      recognition.start();
      setQuickVoiceListening(true);
    } catch (error) {
      console.error(error);
      setQuickVoiceStatus("Voice could not start. Type a name below.");
      setQuickVoiceListening(false);
    }
  };

  const selectQuickVoicePlayer = (player: RoomPlayer) => {
    setPlayers(
      players.map((currentPlayer) =>
        currentPlayer.id === player.id
          ? { ...currentPlayer, attending: true, todayStatus: "here" }
          : currentPlayer,
      ),
    );
    setPrioritizeScannedPlayers(true);
    setQuickVoiceOpen(false);
    setQuickVoiceHeard("");
    setQuickVoiceStatus("");
  };

  const startVoiceListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("Voice is not supported in this browser. You can still paste or type names here.");
      return;
    }

    try {
      voiceShouldListenRef.current = true;
      setVoiceInterimText("");
      navigator.vibrate?.(35);
      recognitionRef.current?.abort?.();
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        const finalText: string[] = [];
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0].transcript.trim();
          if (result.isFinal) finalText.push(transcript);
          else interimText = transcript;
        }
        setVoiceInterimText(interimText);
        if (finalText.length > 0) {
          const heardNames = splitVoiceTextIntoNameLines(finalText.join(" "), players);
          setVoiceText((current) => mergeVoiceNameText(current, heardNames, players));
          setVoiceInterimText("");
        }
      };
      recognition.onerror = (event) => {
        if (voiceShouldListenRef.current && (event.error === "no-speech" || event.error === "network")) {
          setVoiceStatus("");
          return;
        }
        setVoiceStatus(event.error ? `Voice stopped: ${event.error}` : "Voice stopped. You can try again or type names manually.");
        voiceShouldListenRef.current = false;
        setVoiceListening(false);
      };
      recognition.onend = () => {
        if (!voiceShouldListenRef.current) {
          setVoiceListening(false);
          setVoiceInterimText("");
          return;
        }

        setVoiceStatus("");
        window.setTimeout(() => {
          if (!voiceShouldListenRef.current) return;
          try {
            recognition.start();
            setVoiceListening(true);
          } catch {
            setVoiceListening(false);
          }
        }, 300);
      };
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceStatus("");
      setVoiceListening(true);
    } catch (error) {
      console.error(error);
      voiceShouldListenRef.current = false;
      setVoiceStatus("Voice could not start. You can still paste or type names here.");
      setVoiceListening(false);
    }
  };

  const syncVoiceReviewText = (nextText = voiceText) => {
    const reviewInput = makeVoiceTextReviewInput(nextText, players);
    setOcrInputSource("voiceText");
    setOcrText(reviewInput);
    setOcrProgress(reviewInput.trim() ? 100 : 0);
    setOcrStatus(reviewInput.trim() ? "Voice/Text list ready. Import from this screen." : "");
    return reviewInput;
  };

  const reviewVoiceText = () => {
    const reviewInput = syncVoiceReviewText();
    if (!reviewInput.trim()) {
      setVoiceStatus("Type or say at least one clean player name first.");
      return;
    }
    stopVoiceListening();
    setVoiceStatus("Review the matches below, edit the text box if needed, then import selected names.");
  };

  const importSelectedVoiceNames = () => {
    const reviewInput = syncVoiceReviewText();
    if (!reviewInput.trim()) {
      setVoiceStatus("Type or say at least one clean player name first.");
      return;
    }
    stopVoiceListening();
    if (selectedOcrTotal === 0) {
      setVoiceStatus("Select at least one matched or new name below first.");
      return;
    }
    addSelectedOcrMatches();
  };

  useEffect(() => {
    if (openOcrToken > 0) openOcrImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOcrToken]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      quickRecognitionRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (!voiceOpen) return;
    syncVoiceReviewText(voiceText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOpen, voiceText, players]);

  useEffect(() => {
    setSelectedOcrCandidateKeys(
      possibleNames
        .filter((candidate) => {
          if (candidate.status === "match" && candidate.bestMatch) return true;
          if (voiceOpen && ocrInputSource === "voiceText" && candidate.status === "new") return true;
          return false;
        })
        .map(ocrCandidateKey),
    );
  }, [possibleNames, voiceOpen, ocrInputSource]);

  const clearOcrSelection = () => {
    setSelectedScreenshots([]);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("");
    setSelectedOcrCandidateKeys([]);
    setChosenOcrMatchIds({});
    setExpectedAttendeeCount("");
    setShowRawOcrText(false);
    setManualRawOcrName("");
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});
  };

  const runOcr = async () => {
    if (selectedScreenshots.length === 0 || ocrRunning) return;

    setOcrInputSource("screenshot");
    setOcrRunning(true);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("Starting scan…");
    setManualRawOcrName("");
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});

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

  const chooseOcrCandidateAsNew = (candidate: OcrNameCandidate) => {
    const key = ocrCandidateKey(candidate);
    setChosenOcrMatchIds((current) => ({ ...current, [key]: "__new__" }));
    setSelectedOcrCandidateKeys((current) =>
      current.includes(key) ? current : [...current, key],
    );
  };

  const addRawOcrName = (rawName: string) => {
    const cleanedName = cleanOcrLine(rawName);
    const normalizedName = normalizeForMatch(cleanedName);
    if (!cleanedName || !normalizedName || !isProbablyName(cleanedName)) {
      setOcrStatus("Type a clean player name from the raw OCR text first.");
      return;
    }

    const existingPlayer = players.find((player) =>
      playerSearchNames(player).includes(normalizedName),
    );

    if (existingPlayer) {
      setPlayers(
        players.map((player) =>
          player.id === existingPlayer.id
            ? { ...player, attending: true, todayStatus: "here" }
            : player,
        ),
      );
      setPrioritizeScannedPlayers(true);
      setRawOcrAddedNames((current) =>
        current.includes(normalizedName)
          ? current
          : [...current, normalizedName],
      );
      setManualRawOcrName("");
      setOcrStatus(
        `${displayName(existingPlayer)} marked attending from raw OCR text.`,
      );
      return;
    }

    if (rawOcrAddedNames.includes(normalizedName)) {
      setOcrStatus(`${cleanedName} was already added from raw OCR text.`);
      return;
    }

    const now = new Date().toISOString();
    const newPlayerId = createOcrPlayerId();
    const newPlayer: RoomPlayer = {
      id: newPlayerId,
      roomId: 1,
      name: cleanedName,
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
      todayStatus: "here",
      createdAt: now,
      updatedAt: now,
    };

    setPlayers(
      [...players, newPlayer].sort((a, b) =>
        displayName(a).localeCompare(displayName(b)),
      ),
    );
    setPrioritizeScannedPlayers(true);
    setRawOcrAddedNames((current) => [...current, normalizedName]);
    setRawOcrCreatedPlayerIds((current) => [...current, newPlayerId]);
    setManualRawOcrName("");
    setOcrStatus(
      `Created ${cleanedName} from raw OCR text as NEW and attending.`,
    );
  };

  const renderHighlightedRawOcrText = (
    text: string,
    candidates: OcrNameCandidate[],
  ) => {
    const names = Array.from(
      new Map(
        candidates
          .map((candidate) => [normalizeForMatch(candidate.name), candidate])
          .filter(([key]) => Boolean(key)),
      ).values(),
    ).sort((a, b) => b.name.length - a.name.length);

    if (!names.length) return text;

    let parts: React.ReactNode[] = [text];
    names.forEach((candidate) => {
      const escapedName = escapeRegExp(candidate.name.trim());
      if (!escapedName) return;
      const pattern = new RegExp(`(${escapedName})`, "gi");
      parts = parts.flatMap((part, index) => {
        if (typeof part !== "string") return [part];
        return part.split(pattern).map((piece, pieceIndex) => {
          if (piece.toLowerCase() !== candidate.name.toLowerCase())
            return piece;
          const reviewStatus = getOcrReviewStatus(candidate);
          const className =
            reviewStatus === "match"
              ? "rounded bg-emerald-100 px-1 font-black text-emerald-800"
              : reviewStatus === "suggest"
                ? "rounded bg-amber-100 px-1 font-black text-amber-800"
                : "rounded bg-sky-100 px-1 font-black text-sky-800";
          return (
            <mark
              key={`${candidate.name}-${index}-${pieceIndex}`}
              className={className}
            >
              {piece}
            </mark>
          );
        });
      });
    });

    return parts;
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
      gender: newOcrPlayerGenders[ocrCandidateKey(candidate)] ?? "other",
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
      todayStatus: "here",
      createdAt: now,
      updatedAt: now,
    }));

    const nextPlayers = [
      ...players.map((player) =>
        playerIds.has(player.id) ? { ...player, attending: true, todayStatus: "here" } : player,
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
    setVoiceOpen(false);
  };

  const setNewOcrPlayerGender = (candidate: OcrNameCandidate, gender: Gender) => {
    const key = ocrCandidateKey(candidate);
    setNewOcrPlayerGenders((current) => ({ ...current, [key]: gender }));
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
        p.id === player.id
          ? { ...p, attending: !p.attending, todayStatus: "here" }
          : p,
      ),
    );
  };

  const toggleNotHereYet = (player: RoomPlayer) => {
    setPlayers(
      players.map((p) =>
        p.id === player.id
          ? { ...p, attending: true, todayStatus: isNotHereYet(p) ? "here" : "not_here_yet" }
          : p,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {players.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-primary/25 bg-primary/5 p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
            <ImageIcon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-black tracking-tight text-[#102A43]">
            Create your first player list
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-xs font-semibold leading-relaxed text-muted-foreground">
            Fastest setup: import a Meetup, WhatsApp, Telegram, or attendee screenshot and create multiple players at once.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={openImportChoice}
              className="h-10 rounded-xl text-xs font-black uppercase tracking-wide"
              data-testid="empty-today-import-button"
            >
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onAddPlayerManually}
              className="h-10 rounded-xl text-xs font-black uppercase tracking-wide"
              data-testid="empty-today-add-player-button"
            >
              Add Player Manually
            </Button>
          </div>
        </div>
      ) : (
        <>
      <div
        className="flex items-center justify-between rounded-xl border p-3 shadow-sm"
        style={attendingSummaryStyle}
      >
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">
            Today
          </span>
          <span className="text-lg font-black leading-tight text-slate-900">
            {hereNowCount} here
            {notHereYetCount > 0 && (
              <span className="text-xs font-semibold text-amber-700">
                {" · "}{notHereYetCount} not here yet
              </span>
            )}
            <span className="text-xs font-semibold text-slate-500">
              {" "}/ {players.length}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPrioritizeScannedPlayers(false);
              setPlayers(players.map((p) => ({ ...p, attending: true, todayStatus: "here" })));
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
              setPlayers(players.map((p) => ({ ...p, attending: false, todayStatus: "here" })));
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
          onClick={openImportChoice}
          className="h-9 rounded-xl text-xs font-black"
          data-testid="today-import-button"
        >
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          Import
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openQuickVoiceSelect}
          className="h-9 rounded-xl text-xs font-black"
          data-testid="today-quick-voice-button"
        >
          <Mic className="mr-1.5 h-3.5 w-3.5" />
          Quick Select
        </Button>
      </div>

        </>
      )}

      {quickVoiceOpen && (
        <div className="fixed inset-x-4 top-24 z-50 mx-auto max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${quickVoiceListening ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                <Mic className={`h-3.5 w-3.5 ${quickVoiceListening ? "animate-pulse" : ""}`} />
              </span>
              <span>{quickVoiceListening ? "Say one name" : quickVoiceHeard.trim() ? "Choose player" : "Quick Select"}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                stopQuickVoiceListening();
                setQuickVoiceOpen(false);
              }}
              className="rounded-full px-2 py-1 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>

          {quickVoiceListening && (
            <div className="mb-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[11px] font-black text-red-700">
              Listening…
            </div>
          )}

          {!quickVoiceListening && quickVoiceStatus && !quickVoiceHeard.trim() && (
            <div className="mb-2 rounded-2xl bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-500">
              {quickVoiceStatus}
            </div>
          )}

          {quickVoiceHeard.trim() && (
            <div className="space-y-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                Heard: <span className="text-slate-900">{cleanOcrLine(quickVoiceHeard)}</span>
              </div>
              {quickVoiceCandidates.length > 0 ? (
                <div className="space-y-1.5">
                  {quickVoiceCandidates.map(({ player }, index) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => selectQuickVoicePlayer(player)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-xs font-black transition ${index === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      <span className="truncate">{displayName(player)}</span>
                      <span className="shrink-0 text-[10px] font-black">
                        {player.attending ? "Already selected" : "Select"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
                  No roster match. Use search or add manually.
                </div>
              )}
            </div>
          )}

          {!quickVoiceListening && (
            <Button
              type="button"
              variant="outline"
              onClick={startQuickVoiceListening}
              className="mt-2 h-9 w-full rounded-2xl text-xs font-black"
            >
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              Try Again
            </Button>
          )}
        </div>
      )}

      <Dialog open={ocrOpen} onOpenChange={setOcrOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex h-[90dvh] max-h-[90dvh] w-[94vw] max-w-lg md:max-w-3xl flex-col overflow-hidden rounded-2xl p-4 sm:p-6"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              {ocrInputSource === "voiceText"
                ? "Review Voice/Text Names"
                : ocrImportContext === "roster"
                  ? "Add Players from Screenshot"
                  : "Screenshot Import"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {ocrInputSource === "voiceText"
                ? "Check matches and new players before anything is added to Today."
                : ocrImportContext === "roster"
                  ? "Add multiple players to your roster from a Meetup, WhatsApp, Telegram, or attendee screenshot."
                  : "Import today's attendees from a Meetup, WhatsApp, Telegram, or list screenshot."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-2">
            {ocrInputSource === "screenshot" && (
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
                  setManualRawOcrName("");
                  setRawOcrAddedNames([]);
                  setRawOcrCreatedPlayerIds([]);
                }}
                data-testid="ocr-file-input"
              />
            </label>
            )}

            {ocrInputSource === "screenshot" && selectedScreenshotNames.length > 0 && !ocrText && !ocrRunning && !ocrStatus && (
              <div className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-foreground">
                      {selectedScreenshotNames.length} screenshot{selectedScreenshotNames.length === 1 ? "" : "s"} selected
                    </div>
                    <div className="truncate text-[10px] font-medium text-muted-foreground">
                      Check for duplicates before scanning.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearOcrSelection}
                    className="h-7 shrink-0 px-2 text-[10px] font-black"
                  >
                    Clear
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {selectedScreenshotPreviews.map((preview, index) => (
                    <div key={`${preview.name}-${index}`} className="overflow-hidden rounded-lg border bg-muted/30">
                      <img
                        src={preview.url}
                        alt={preview.name}
                        className="h-24 w-full object-cover sm:h-28"
                      />
                      <div className="truncate px-2 py-1 text-[9px] font-bold text-muted-foreground">
                        {index + 1}. {preview.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ocrInputSource === "screenshot" && selectedScreenshotNames.length > 0 && (ocrRunning || ocrStatus || ocrText) && (
              <div className="rounded-xl border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-xs font-black text-foreground">
                    ✓ {selectedScreenshotNames.length} screenshot{selectedScreenshotNames.length === 1 ? "" : "s"} {ocrText ? "scanned" : "loaded"}
                  </div>
                  {!ocrRunning && !ocrText && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearOcrSelection}
                      className="h-7 shrink-0 px-2 text-[10px] font-black"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {ocrInputSource === "screenshot" && (ocrRunning || ocrStatus) && (
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
                    {ocrInputSource === "voiceText" ? "List Summary" : "Scan Summary"}
                  </div>
                  {hasExpectedAttendeeNumber && (
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-black ${missingFromScan > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {scannedNameCount} / {Math.round(expectedAttendeeNumber)}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
                  <span className="rounded-full bg-muted/60 px-2 py-1 text-foreground">
                    {ocrInputSource === "voiceText" ? "Parsed" : "Found"}: {scannedNameCount}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">
                    ✓ {rosterMatchCount}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">
                    ? {suggestions}
                  </span>
                  <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-800">
                    + {newNames}
                  </span>
                  {hasExpectedAttendeeNumber && missingFromScan > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">
                      {missingFromScan} missing
                    </span>
                  )}
                </div>
                {unmatchedScannedNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {unmatchedScannedNames.slice(0, 8).map((candidate) => (
                      <span key={ocrCandidateKey(candidate)} className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-800 ring-1 ring-sky-100">
                        + {candidate.name}
                      </span>
                    ))}
                    {unmatchedScannedNames.length > 8 && (
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-black text-muted-foreground">
                        +{unmatchedScannedNames.length - 8} more
                      </span>
                    )}
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
                      const reviewStatus = getOcrReviewStatus(candidate);

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
                                {reviewStatus === "match" && resolvedMatch && (
                                  <div className="mt-0.5 font-medium text-emerald-700">
                                    MATCH: {displayName(resolvedMatch)} ·{" "}
                                    {candidate.score}%
                                  </div>
                                )}
                                {reviewStatus === "suggest" &&
                                  resolvedMatch && (
                                    <div className="mt-0.5 font-medium text-amber-700">
                                      SELECTED: {displayName(resolvedMatch)} ·{" "}
                                      {candidate.score}%
                                    </div>
                                  )}
                                {reviewStatus === "new" && (
                                  <div className="mt-0.5 font-medium text-sky-700">
                                    {resolvedMatch
                                      ? `NEW: ${displayName(resolvedMatch)} added from import`
                                      : "NEW: Will create roster player if selected"}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                reviewStatus === "match"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : reviewStatus === "suggest"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                              }`}
                            >
                              {reviewStatus === "match"
                                ? "MATCH"
                                : reviewStatus === "suggest"
                                  ? "CHECK"
                                  : "NEW"}
                            </div>
                          </div>
                          {reviewStatus !== "match" &&
                            candidate.suggestions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {candidate.suggestions
                                  .slice(0, 5)
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
                                {candidate.status === "suggest" && (
                                  <button
                                    type="button"
                                    onClick={() => chooseOcrCandidateAsNew(candidate)}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                      chosenOcrMatchIds[candidateKey] === "__new__"
                                        ? "bg-sky-100 text-sky-900 border-sky-300"
                                        : "bg-card text-muted-foreground"
                                    }`}
                                  >
                                    {chosenOcrMatchIds[candidateKey] === "__new__" ? "✓ " : "Add as new: "}
                                    {candidate.name}
                                  </button>
                                )}
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

            {ocrInputSource === "screenshot" && ocrText && (
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
                  <div className="mt-2 space-y-2">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-800">
                      Green = roster match, amber = check, blue = new. If a real
                      name is visible but was missed, type it below or use Add
                      on a clean raw line.
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        value={manualRawOcrName}
                        onChange={(event) =>
                          setManualRawOcrName(event.target.value)
                        }
                        placeholder="Type missing name from raw text"
                        className="h-9 rounded-xl text-xs font-bold"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addRawOcrName(manualRawOcrName)}
                        disabled={!manualRawOcrName.trim()}
                        className="h-9 rounded-xl px-3 text-[10px] font-black"
                      >
                        Add
                      </Button>
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-muted/50 p-2 text-[11px] leading-relaxed text-foreground">
                      {rawOcrLineEntries.map((entry) => {
                        const alreadyAdded = rawOcrAddedNames.includes(
                          entry.normalized,
                        );
                        return (
                          <div
                            key={`${entry.index}-${entry.normalized}`}
                            className="rounded-md bg-card/70 p-2 ring-1 ring-border/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 whitespace-pre-wrap break-words">
                                {renderHighlightedRawOcrText(
                                  entry.text,
                                  entry.foundCandidates,
                                )}
                              </div>
                              {entry.suggestedName && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    addRawOcrName(entry.suggestedName)
                                  }
                                  disabled={alreadyAdded}
                                  className="h-6 shrink-0 px-2 text-[9px] font-black"
                                >
                                  {alreadyAdded ? "Added" : "Add"}
                                </Button>
                              )}
                            </div>
                            {entry.foundCandidates.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {entry.foundCandidates.map((candidate) => {
                                  const reviewStatus =
                                    getOcrReviewStatus(candidate);
                                  return (
                                    <span
                                      key={ocrCandidateKey(candidate)}
                                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                                        reviewStatus === "match"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : reviewStatus === "suggest"
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-sky-100 text-sky-800"
                                      }`}
                                    >
                                      {reviewStatus === "match"
                                        ? "MATCH"
                                        : reviewStatus === "suggest"
                                          ? "CHECK"
                                          : "NEW"}{" "}
                                      {candidate.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-3 sm:gap-2">
            {!ocrText ? (
              ocrImportContext === "roster" ? (
                <div className="flex w-full items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOcrOpen(false)}
                    className="h-10 rounded-xl px-4 text-xs font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={runOcr}
                    disabled={selectedScreenshots.length === 0 || ocrRunning}
                    className="h-10 rounded-xl px-4 text-xs font-black"
                  >
                    {ocrRunning ? "Scanning…" : "Scan Screenshot"}
                  </Button>
                </div>
              ) : (
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
              )
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
              default Skill Level 5 and add them to Today?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border bg-muted/40 p-3">
            {selectedNewCandidates.map((candidate) => {
              const key = ocrCandidateKey(candidate);
              const selectedGender = newOcrPlayerGenders[key] ?? "other";
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-black text-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <div className="flex shrink-0 rounded-full border bg-muted/40 p-0.5" aria-label={`Gender for ${candidate.name}`}>
                    {[
                      { value: "other" as Gender, label: "?" },
                      { value: "male" as Gender, label: "M" },
                      { value: "female" as Gender, label: "F" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setNewOcrPlayerGender(candidate, option.value)}
                        className={`h-6 min-w-6 rounded-full px-2 text-[10px] font-black transition ${
                          selectedGender === option.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-background"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl bg-sky-50 p-3 text-[11px] font-medium text-sky-800 border border-sky-100">
            New players will start with Skill Level 5 and the NEW badge. You can
            edit them later in the Roster tab.
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
              NEW names will be created with Skill Level 5.
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

      <Dialog
        open={voiceOpen}
        onOpenChange={(open) => {
          if (!open) stopVoiceListening();
          setVoiceOpen(open);
        }}
      >
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`flex h-[88dvh] max-h-[88dvh] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl p-4 sm:p-6 ${voiceListening ? "ring-2 ring-red-300" : ""}`}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-black">Say or Paste Names</DialogTitle>
            <DialogDescription className="text-xs">
              Say, paste, or type names. The text box is the control center.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-2">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border bg-card p-3">
              <div>
                <label htmlFor="voice-expected-attendee-count" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Expected
                  <span className="font-bold normal-case tracking-normal text-muted-foreground/80"> (optional)</span>
                </label>
                <Input
                  id="voice-expected-attendee-count"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={voiceExpectedAttendeeCount}
                  onChange={(event) => setVoiceExpectedAttendeeCount(event.target.value)}
                  placeholder="Example: 18"
                  className="h-10 rounded-xl text-sm font-bold"
                />
              </div>
              <div className={`rounded-xl px-3 py-2 text-center text-[11px] font-black ${hasVoiceExpectedAttendeeNumber && voiceMissingCount > 0 ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-muted text-foreground"}`}>
                <div>{voiceCapturedCount}{hasVoiceExpectedAttendeeNumber ? ` / ${Math.round(voiceExpectedAttendeeNumber)}` : ""}</div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">names</div>
              </div>
            </div>

            <Textarea
              value={voiceText}
              onChange={(event) => setVoiceText(event.target.value)}
              onBlur={() => setVoiceText((current) => formatVoiceNameList(splitVoiceTextIntoNameLines(current, players)))}
              placeholder="Joon, Jan, Andrea, Phillip R, Jorge"
              className={`min-h-36 resize-none rounded-xl text-sm font-semibold leading-relaxed ${voiceListening ? "border-red-300 ring-2 ring-red-100" : ""}`}
              data-testid="voice-text-import-notepad"
            />

            {voiceListening && voiceInterimText && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] font-bold text-red-800">
                Hearing: “{voiceInterimText}”
              </div>
            )}
            {!voiceListening && voiceStatus && (
              <div className="rounded-xl border bg-muted/50 p-2 text-[11px] font-bold text-muted-foreground">
                {voiceStatus}
              </div>
            )}

            <div className="rounded-xl border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Smart match review</div>
                </div>
                {possibleNames.length > 0 && (
                  <div className="shrink-0 text-[10px] font-black text-muted-foreground">
                    {safeMatches} match · {suggestions} check · {newNames} new
                  </div>
                )}
              </div>

              {possibleNames.length > 0 ? (
                <div className="space-y-2">
                  {possibleNames.map((candidate, index) => {
                    const candidateKey = ocrCandidateKey(candidate);
                    const isSelectedMatch = selectedOcrCandidateKeySet.has(candidateKey);
                    const resolvedMatch = resolveOcrMatch(candidate);
                    const reviewStatus = getOcrReviewStatus(candidate);
                    return (
                      <div key={`${candidate.name}-${index}`} className={`rounded-lg p-2.5 text-[11px] ${isSelectedMatch ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 gap-2">
                            <Checkbox checked={isSelectedMatch} onCheckedChange={() => toggleOcrCandidate(candidate)} className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
                            <div className="min-w-0">
                              <div className="font-black text-foreground">{candidate.name}</div>
                              {reviewStatus === "match" && resolvedMatch && <div className="mt-0.5 font-medium text-emerald-700">MATCH: {displayName(resolvedMatch)} · {candidate.score}%</div>}
                              {reviewStatus === "suggest" && resolvedMatch && <div className="mt-0.5 font-medium text-amber-700">SELECTED: {displayName(resolvedMatch)} · {candidate.score}%</div>}
                              {reviewStatus === "new" && <div className="mt-0.5 font-medium text-sky-700">NEW: Will create roster player if selected</div>}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${reviewStatus === "match" ? "bg-emerald-100 text-emerald-800" : reviewStatus === "suggest" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                            {reviewStatus === "match" ? "MATCH" : reviewStatus === "suggest" ? "CHECK" : "NEW"}
                          </span>
                        </div>
                        {reviewStatus !== "match" && candidate.suggestions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {candidate.suggestions.slice(0, 5).map(({ player, score }) => {
                              const isChosen = resolvedMatch?.id === player.id;
                              return (
                                <button key={player.id} type="button" onClick={() => chooseOcrSuggestion(candidate, player)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isChosen ? "border-amber-300 bg-amber-100 text-amber-900" : "bg-card text-muted-foreground"}`}>
                                  {isChosen ? "✓ " : "+ "}{displayName(player)} {score}%
                                </button>
                              );
                            })}
                            {candidate.status === "suggest" && (
                              <button type="button" onClick={() => chooseOcrCandidateAsNew(candidate)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${chosenOcrMatchIds[candidateKey] === "__new__" ? "border-sky-300 bg-sky-100 text-sky-900" : "bg-card text-muted-foreground"}`}>
                                {chosenOcrMatchIds[candidateKey] === "__new__" ? "✓ " : "+ New: "}{candidate.name}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg bg-muted/50 p-3 text-center text-xs font-medium text-muted-foreground">Names typed above will appear here.</div>
              )}
            </div>


          </div>

          <DialogFooter className="shrink-0 border-t pt-3">
            <div className="flex w-full items-center gap-2">
              <Button
                type="button"
                variant={voiceListening ? "destructive" : "outline"}
                onClick={() => {
                  if (voiceListening) stopVoiceListening();
                  else startVoiceListening();
                }}
                className={`h-10 rounded-xl px-3 text-xs font-black ${
                  voiceListening
                    ? "border-2 border-red-700 bg-red-600 text-white shadow-lg ring-4 ring-red-200"
                    : "border-2"
                }`}
              >
                <Mic className={`mr-1.5 h-3.5 w-3.5 ${voiceListening ? "animate-pulse" : ""}`} />
                {voiceListening ? "RECORDING — TAP TO STOP" : "Record"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { stopVoiceListening(); setVoiceText(""); setVoiceStatus(""); setVoiceInterimText(""); }} disabled={!voiceText.trim() && !voiceListening} className="h-10 rounded-xl px-3 text-xs font-bold">
                Clear
              </Button>
              <Button type="button" onClick={importSelectedVoiceNames} disabled={!voiceText.trim() || selectedOcrTotal === 0} className="h-10 min-w-0 flex-1 rounded-xl px-3 text-xs font-black">
                Import Names ({selectedOcrTotal})
              </Button>
            </div>
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
                {(player.isNew ||
                  player.isGoalkeeper ||
                  player.isOrganizer ||
                  (player.attending && isNotHereYet(player))) && (
                  <div className="mt-0.5 flex flex-wrap gap-1 min-w-0">
                    {player.isNew && <NewBadge />}
                    {player.isGoalkeeper && <GKBadge />}
                    {player.isOrganizer && <ORGBadge />}
                    {player.attending && isNotHereYet(player) && <NotHereBadge />}
                  </div>
                )}
              </div>
              {player.attending && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleNotHereYet(player);
                  }}
                  className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors ${
                    isNotHereYet(player)
                      ? "border-amber-300 bg-amber-100 text-amber-800"
                      : "border-slate-200 bg-white/80 text-slate-500"
                  }`}
                  data-testid={`today-status-${player.id}`}
                >
                  {isNotHereYet(player) ? "Arrived?" : "Not here"}
                </button>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

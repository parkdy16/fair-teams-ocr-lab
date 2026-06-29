import React, { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import type { RoomPlayer, RoomRoster } from "@/lib/localRoster";
import {
  candidateNamesForRosterPlayer as sharedCandidateNamesForRosterPlayer,
  scorePlayerNameMatch as sharedScorePlayerNameMatch,
  voiceNameAlternates as sharedVoiceNameAlternates,
} from "@/lib/playerNameMatching";
import type { Gender } from "@/lib/types";
import { listenToSharedRosterUser, type SharedRosterUser } from "@/lib/sharedRosterService";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronRight,
  Clock3,
  ClipboardList,
  Eye,
  Image as ImageIcon,
  Info,
  Mic,
  Search,
  Upload,
  X,
} from "lucide-react";
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

function StatusDot({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full border ${className}`}
      title={label}
      aria-label={label}
    />
  );
}

function TodayStatusDots({
  player,
}: {
  player: Pick<RoomPlayer, "isNew" | "isGoalkeeper" | "isOrganizer">;
}) {
  const labels = [
    player.isNew ? "New player" : null,
    player.isGoalkeeper ? "Goalkeeper" : null,
    player.isOrganizer ? "Organizer" : null,
  ].filter(Boolean);

  if (labels.length === 0) return null;

  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center gap-1"
      title={labels.join(", ")}
      aria-label={labels.join(", ")}
    >
      {player.isNew && (
        <StatusDot label="New player" className="border-sky-200 bg-sky-100" />
      )}
      {player.isGoalkeeper && (
        <StatusDot label="Goalkeeper" className="border-emerald-200 bg-emerald-100" />
      )}
      {player.isOrganizer && (
        <StatusDot label="Organizer" className="border-orange-200 bg-orange-100" />
      )}
    </span>
  );
}

function isFirebaseSharedRoster(roster: RoomRoster) {
  return roster.cloudSource?.provider === "firebase" && Boolean(roster.cloudSource.firebaseRosterId);
}


function fallbackOrganizerName(email: string) {
  const prefix = email.split("@")[0] || "Organizer";
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Organizer";
}

function organizerGreetingName(user: SharedRosterUser | null) {
  const name = user?.displayName?.trim() || (user?.email ? fallbackOrganizerName(user.email) : "");
  return name ? name.split(/\s+/)[0] : "";
}

function RosterKindBadge({ roster }: { roster: RoomRoster }) {
  const shared = isFirebaseSharedRoster(roster);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${shared ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100" : "bg-slate-100 text-slate-500"}`}
      title={shared ? "Shared roster" : "Local roster"}
    >
      {shared ? "Shared" : "Local"}
    </span>
  );
}

function isNotHereYet(player: Pick<RoomPlayer, "todayStatus">) {
  return player.todayStatus === "not_here_yet";
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
type ScreenshotImportMode = "meetup" | "other";
type CropBox = { x: number; y: number; w: number; h: number };
type CropDragMode = "draw" | "move" | "resize";
type CropResizeHandle = "nw" | "ne" | "sw" | "se";

type OcrScreenshotReport = {
  index: number;
  name: string;
  type: string;
  sizeBytes: number;
  lastModified: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  cropPercent?: CropBox | null;
  cropPixelApprox?: { x: number; y: number; w: number; h: number } | null;
  cropAreasPercent?: CropBox[] | null;
  cropAreasPixelApprox?: Array<{ x: number; y: number; w: number; h: number } | null> | null;
  passes: string[];
};

function safeIsoDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number | null; height: number | null }>((resolve) => {
    if (typeof URL === "undefined" || typeof Image === "undefined") {
      resolve({ width: null, height: null });
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (dimensions: { width: number | null; height: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };

    image.onload = () =>
      finish({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    image.onerror = () => finish({ width: null, height: null });
    image.src = url;
  });
}

function cropPercentToPixels(crop: CropBox | null | undefined, width: number | null, height: number | null) {
  if (!crop || !width || !height) return null;
  return {
    x: Math.round((crop.x / 100) * width),
    y: Math.round((crop.y / 100) * height),
    w: Math.round((crop.w / 100) * width),
    h: Math.round((crop.h / 100) * height),
  };
}

function isUsableCropBox(crop: CropBox | null | undefined) {
  return Boolean(crop && crop.w >= 3 && crop.h >= 3);
}

function downloadJsonFile(filename: string, data: unknown) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeReportFilenamePart(value: string) {
  return (value || "scan")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase() || "scan";
}

function getViewportReport() {
  if (typeof window === "undefined") return null;
  const visualViewport = window.visualViewport;
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    screenAvailHeight: window.screen?.availHeight ?? null,
    visualViewportWidth: visualViewport?.width ?? null,
    visualViewportHeight: visualViewport?.height ?? null,
    visualViewportScale: visualViewport?.scale ?? null,
    orientation: window.screen?.orientation?.type ?? null,
  };
}

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
  // Keep short OCR fragments here only if downstream checks treat them as
  // exact words. Substring matching with "na" once blocked Natasha/Katharina.
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

const MEETUP_MARKER_PATTERN = /\b(?:member|event host|bekanntes gesicht)\b/i;
// Inline collapsed-text extraction is tuned for English Meetup role markers.
// German/dark-mode screenshots are handled by adjacent-line and loose review
// fallback rules below; using "Bekanntes Gesicht" as an inline split marker can
// merge UI copy with nearby names.
const MEETUP_INLINE_MARKER_PATTERN = /\b(?:member|event host)\b/i;
const MEETUP_INLINE_SPLIT_PATTERN = /\b(?:member|event host)\b/gi;

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
  "teilnehmer",
  "teilnehmerdetails",
  "teilneh",
  "relevanz",
  "abgesagt",
  "bekanntes",
  "gesicht",
  "bekanntes gesicht",
  "kostenlos",
  "ausprobieren",
  "erfahre",
  "mehr",
  "uber",
  "iber",
  "iiber",
  "liber",
  "die",
  "an",
  "vodafone",
  "telekom",
  "telefonica",
  "wifi",
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

// Meetup screenshots often place RSVP answers or tiny UI fragments directly
// before/after the bold attendee name in the OCR text. Keep the chips visible
// in Review Names, but preselect only the likely name words.
const OCR_REVIEW_LEADING_NAME_NOISE = new Set([
  "yup",
  "yes",
  "yess",
  "ja",
  "jaaa",
  "can",
  "eyed",
  "agree",
  "agreed",
]);

const OCR_REVIEW_TRAILING_NAME_NOISE = new Set([
  "ory",
  "vee",
  "srogey",
  "is",
]);

const OCR_NAME_PREFIX_PHRASES = [
  ["see", "more"],
  ["show", "more"],
  ["view", "more"],
  ["read", "more"],
  // Keep single words such as "Abou", "About", and "Could" intact.
  // They can be real names or OCR variants of real names, so the review UI
  // should let the user edit them instead of silently stripping them.
  ["i", "could"],
] as const;

const OCR_NAME_TRAILING_NOISE = new Set([
  ...MEETUP_NOISE_WORDS,
  "member",
  "members",
]);

const NAME_PARTICLES = new Set([
  "de",
  "del",
  "der",
  "di",
  "da",
  "dos",
  "du",
  "la",
  "le",
  "van",
  "von",
]);

function tokenKey(value: string) {
  return normalizeForMatch(value).replace(/\s+/g, "");
}

function titleCaseNameWord(word: string) {
  return word
    .split(/([-'])/)
    .map((part) => {
      if (part === "-" || part === "'") return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function titleCaseName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const key = tokenKey(word);
      if (index > 0 && NAME_PARTICLES.has(key)) return key;

      const hasLower = /[a-zà-öø-ÿ]/.test(word);
      const hasUpper = /[A-ZÀ-ÖØ-Þ]/.test(word);

      if ((hasLower && !hasUpper) || (!hasLower && hasUpper)) {
        return titleCaseNameWord(word);
      }

      return word;
    })
    .join(" ");
}

function stripOcrNamePrefixTokens(tokens: string[]) {
  let output = [...tokens];
  let changed = true;

  while (changed && output.length > 1) {
    changed = false;
    for (const phrase of OCR_NAME_PREFIX_PHRASES) {
      if (output.length <= phrase.length) continue;
      const matchesPhrase = phrase.every(
        (word, index) => tokenKey(output[index]) === word,
      );
      if (matchesPhrase) {
        output = output.slice(phrase.length);
        changed = true;
        break;
      }
    }
  }

  return output;
}

function cleanDetectedNameCandidate(value: string) {
  const cleaned = cleanOcrLine(value);
  if (!cleaned) return "";

  let tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";

  tokens = stripOcrNamePrefixTokens(tokens);

  while (tokens.length > 1 && isMeetupNoiseToken(tokens[0])) {
    tokens = tokens.slice(1);
  }

  while (tokens.length > 1 && OCR_LEADING_NAME_NOISE.has(tokenKey(tokens[0]))) {
    tokens = tokens.slice(1);
  }

  while (
    tokens.length > 1 &&
    OCR_NAME_TRAILING_NOISE.has(tokenKey(tokens[tokens.length - 1]))
  ) {
    tokens = tokens.slice(0, -1);
  }

  const candidate = cleanOcrLine(tokens.join(" "));
  if (!candidate) return "";

  return titleCaseName(candidate);
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
  const clean = cleanDetectedNameCandidate(value);
  if (!clean || isMeetupCommentLine(clean)) return false;
  return isProbablyName(clean) || isProbablySingleUsername(clean);
}

function isLooseOcrReviewName(value: string) {
  const clean = cleanDetectedNameCandidate(stripOtherScreenshotListPrefix(value));
  const normalized = normalizeForMatch(clean);
  if (!clean || !normalized) return false;
  if (OCR_JUNK_WORDS.has(normalized) || OTHER_SCREENSHOT_JUNK_WORDS.has(normalized)) return false;
  if (isMeetupCommentLine(clean)) return false;
  if (/\d/.test(clean)) return false;
  if (clean.length < 3 || clean.length > 36) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (words.some((word) => word.length === 1 && words.length > 1)) return false;
  if (words.some((word) => MEETUP_STOP_WORDS.has(word) || OTHER_SCREENSHOT_JUNK_WORDS.has(word))) return false;
  if (/\b(?:vodafone|telekom|telefonica|wifi|teilnehmer|relevanz|kostenlos|ausprobieren|erfahre|abgesagt)\b/i.test(normalized)) return false;
  return isProbablyName(clean) || isProbablySingleUsername(clean);
}

function extractLooseOcrReviewNames(lines: string[]) {
  const byKey = new Map<string, { name: string; count: number; nearMarker: boolean }>();
  lines.forEach((line, index) => {
    if (!isLooseOcrReviewName(line)) return;
    const clean = cleanDetectedNameCandidate(stripOtherScreenshotListPrefix(line));
    const key = normalizeForMatch(clean);
    if (!key) return;
    const previous = normalizeForMatch(lines[index - 1] || "");
    const next = normalizeForMatch(lines[index + 1] || "");
    const nearMarker = MEETUP_MARKER_PATTERN.test(previous) || MEETUP_MARKER_PATTERN.test(next);
    const current = byKey.get(key);
    byKey.set(key, {
      name: current?.name || clean,
      count: (current?.count || 0) + 1,
      nearMarker: Boolean(current?.nearMarker || nearMarker),
    });
  });

  return Array.from(byKey.values())
    .filter(({ count, nearMarker }) => count >= 2 || nearMarker)
    .map(({ name }) => name);
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
    const cleanedCandidate = cleanDetectedNameCandidate(candidate);
    if (
      cleanedCandidate &&
      (isProbablyName(cleanedCandidate) ||
        isProbablySingleUsername(cleanedCandidate))
    ) {
      return cleanedCandidate;
    }
  }

  return null;
}

function extractInlineMeetupNames(text: string) {
  const oneLineText = text
    .replace(/---.*?\.(jpg|jpeg|png).*?---/gi, " ")
    .replace(/\r?\n/g, " ");
  const cleaned = cleanOcrLine(oneLineText);
  if (!MEETUP_INLINE_MARKER_PATTERN.test(cleaned)) return [];

  const parts = cleaned.split(MEETUP_INLINE_SPLIT_PATTERN);
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
      const candidate = cleanDetectedNameCandidate(group.join(" "));
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

const OTHER_SCREENSHOT_JUNK_WORDS = new Set([
  ...OCR_JUNK_WORDS,
  "football",
  "soccer",
  "futsal",
  "game",
  "match",
  "training",
  "tonight",
  "tomorrow",
  "today",
  "players",
  "player",
  "attending",
  "available",
  "confirmed",
  "coming",
  "maybe",
  "waiting",
  "meeting",
  "bring",
  "shirt",
  "shirts",
  "white",
  "dark",
  "black",
  "blue",
  "red",
  "green",
  "yellow",
  "team",
  "teams",
  "roster",
  "lineup",
  "group",
  "chat",
  "message",
  "messages",
  "online",
  "typing",
  "reply",
  "forward",
  "today football",
  "tuesday football",
  "wednesday football",
  "thursday football",
  "friday football",
  "saturday football",
  "sunday football",
  "monday football",
  "see you",
  "see you all",
  "thanks",
  "thank you",
  "hello",
  "hi",
  "hey",
  "ok",
  "okay",
  "done",
  "clear",
  "back",
  "next",
  "scan",
  "use this area",
  "shake",
  "shot",
  "shots",
  "score",
  "scores",
  "total",
  "settings",
  "save",
  "saved",
  "edit",
  "class",
  "classes",
  "present",
  "absent",
]);

const OTHER_SCREENSHOT_LABEL_PATTERN =
  /^\s*(?:attending|players?|participants?|names?|lineup|roster|team|confirmed|coming|available|list)\b\s*(?:tonight|today)?\s*(?:[:\-–—.]\s*)+/i;

function stripOtherScreenshotListPrefix(value: string) {
  return value
    .replace(/^\s*(?:\d{1,3}|[a-z])\s*[.)\]:\-–—]+\s*/i, "")
    .replace(/^\s*[•●▪︎◆◇▶︎►✓✔☑-]+\s*/i, "")
    .replace(OTHER_SCREENSHOT_LABEL_PATTERN, "");
}

function isProbablyOtherScreenshotName(value: string, roster: RoomPlayer[]) {
  const clean = cleanDetectedNameCandidate(
    stripOtherScreenshotListPrefix(value),
  );
  const normalized = normalizeForMatch(clean);
  if (!clean || !normalized) return false;
  if (OTHER_SCREENSHOT_JUNK_WORDS.has(normalized)) return false;
  if (
    [...OTHER_SCREENSHOT_JUNK_WORDS].some((word) => {
      // Very short OCR junk such as "na" or "hi" should only be rejected as an
      // exact word. Substring matching rejected real names like Natasha,
      // Katharina, and Alanah because they contain "na".
      if (word.length < 3) return false;
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(word)}(?=\\s|$)`);
      return pattern.test(normalized) && normalized.length <= word.length + 8;
    })
  ) {
    return false;
  }
  if (/\d/.test(clean)) return false;
  if (clean.length < 3 || clean.length > 36) return false;

  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 3) return false;

  // Do not let multi-pass OCR fragments such as "UI", "vo", "Lz", "Oo",
  // "Si", or "Ra" become players. Short saved roster names can still be
  // rescued by the roster-signal pass below.
  if (words.some((word) => word.length < 3 && !NAME_PARTICLES.has(word))) {
    return hasRosterSignal(clean, roster);
  }

  if (words.length === 1) {
    const word = words[0];
    if (word.length < 3) return hasRosterSignal(clean, roster);
    if (/^(ui|vo|oo|lz|si|ra|pm|am|www|com|de|app|ios)$/i.test(word)) {
      return hasRosterSignal(clean, roster);
    }
  }

  const stopwordMatch = clean.match(
    /\b(i|we|you|he|she|they|it|this|that|but|would|like|come|join|plan|moved|time|thing|attend|club|anymore|gathering|question|list|event|search|checked|attendees?|team|teams|done|share|players?|message|chat|football|soccer|shirt|shirts|bring|meeting|tonight|tomorrow|today)\b/i,
  );
  if (stopwordMatch) {
    // Prefer showing a noisy candidate with removable chips over hiding a real
    // name. Still reject pure UI/comment phrases, but allow a label/prefix when
    // it is followed by at least one good-looking name token.
    const hasNameAfterStopword = words.some(
      (word) =>
        word.length >= 3 &&
        !OTHER_SCREENSHOT_JUNK_WORDS.has(word) &&
        !/^(players?|team|teams|list|event|search|today|tomorrow|tonight)$/.test(word),
    );
    if (!hasNameAfterStopword) return false;
  }

  // All-caps multi-word OCR is usually header/UI text rather than names.
  if (/^[A-Z\s]{4,}$/.test(clean) && words.length > 1) return false;

  return true;
}

function splitOtherScreenshotNameSegments(rawLine: string) {
  const withoutPrefix = stripOtherScreenshotListPrefix(rawLine.trim());
  if (!withoutPrefix) return [];

  const labelMatch = rawLine.match(
    /\b(?:attending|players?|participants?|names?|lineup|roster|confirmed|coming|available)\b\s*(?:[:\-–—.]\s*)+(.+)$/i,
  );
  const source = labelMatch?.[1] ?? withoutPrefix;

  // Email/WhatsApp/Gmail screenshots often contain comma-separated name
  // sequences inside a sentence, for example:
  // "players. Nicole, Joon, Sascha..."
  // Split only on visible separators; plain space-only team sheets should stay
  // line-based so two columns are not broken into loose OCR words.
  if (/[;,/|]/.test(source)) {
    return source
      .split(/[;,/|]+/)
      .map((part) => stripOtherScreenshotListPrefix(part.trim()))
      .filter(Boolean);
  }

  // OCR sometimes drops commas from sentence-style lists after a label:
  // "players. Nicole Joon Sascha Vivian Jay Enaree"
  // In this specific labelled case, split title-cased single-word runs into
  // separate names. Do not apply this to ordinary team-sheet lines like
  // "Andrew Daniel", where the space is part of one person's name.
  if (labelMatch) {
    const words = source.split(/\s+/).map((word) => cleanOcrLine(word)).filter(Boolean);
    const canSplitLabelList =
      words.length >= 3 &&
      words.length <= 24 &&
      words.every((word) => /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'.-]{2,}$/.test(word)) &&
      !words.some((word) => NAME_PARTICLES.has(tokenKey(word)));

    if (canSplitLabelList) {
      return words;
    }
  }

  return [source];
}

function extractDelimitedOtherScreenshotNames(rawLine: string, roster: RoomPlayer[]) {
  if (!/[;,/|]/.test(rawLine)) return [];

  return splitOtherScreenshotNameSegments(rawLine)
    .map((segment) =>
      cleanDetectedNameCandidate(stripOtherScreenshotListPrefix(segment)),
    )
    .filter((segment) => segment && isProbablyOtherScreenshotName(segment, roster));
}


function scoreOtherScreenshotNameCandidate(value: string, roster: RoomPlayer[]) {
  const clean = cleanDetectedNameCandidate(value);
  const normalized = normalizeForMatch(clean);
  if (!clean || !normalized) return -999;

  let score = 0;
  if (hasRosterSignal(clean, roster)) score += 80;
  if (/^[A-Z][a-z]+(?:[\s'-][A-Z][a-z]+){0,2}$/.test(clean)) score += 30;
  if (/^[A-Za-z\s'-]+$/.test(clean)) score += 20;
  if (/[aeiou]/i.test(clean)) score += 8;
  if (clean.length >= 4 && clean.length <= 18) score += 8;
  if (clean.length > 22) score -= 10;
  if (/^[A-Z\s]{4,}$/.test(clean)) score -= 10;
  if (/[^A-Za-z\s'-]/.test(clean)) score -= 30;
  if (OTHER_SCREENSHOT_JUNK_WORDS.has(normalized)) score -= 100;
  if (/\b(?:football|players?|attending|tonight|shirts?|message|online|today|forget|bring|see|you|all)\b/i.test(clean)) score -= 100;
  return score;
}

function chooseOtherScreenshotNameCandidate(candidates: string[], roster: RoomPlayer[]) {
  let best = '';
  let bestScore = -999;
  for (const candidate of candidates) {
    const cleaned = cleanDetectedNameCandidate(stripOtherScreenshotListPrefix(candidate));
    if (!cleaned || !isProbablyOtherScreenshotName(cleaned, roster)) continue;
    const score = scoreOtherScreenshotNameCandidate(cleaned, roster);
    if (score > bestScore) {
      best = cleaned;
      bestScore = score;
    }
  }
  return best;
}

function extractOtherScreenshotNames(text: string, roster: RoomPlayer[]) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names: string[] = [];
  const structuredListDetected =
    rawLines.filter((line) => /^\s*\d{1,3}\s*[.)\]:\-–—]+\s+/.test(line))
      .length >= 3;

  if (structuredListDetected) {
    const numberedCandidates = new Map<number, string[]>();

    for (const rawLine of rawLines) {
      const numberedMatch = rawLine.match(
        /^\s*(\d{1,3})\s*[.)\]:\-–—]+\s+(.+)$/i,
      );
      if (!numberedMatch) continue;

      const listNumber = Number(numberedMatch[1]);
      if (!Number.isFinite(listNumber) || listNumber < 1 || listNumber > 80)
        continue;

      const lineCandidates = splitOtherScreenshotNameSegments(
        numberedMatch[2],
      ).filter(Boolean);
      if (!lineCandidates.length) continue;

      numberedCandidates.set(listNumber, [
        ...(numberedCandidates.get(listNumber) ?? []),
        ...lineCandidates,
      ]);
    }

    Array.from(numberedCandidates.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([, candidates]) => {
        const best = chooseOtherScreenshotNameCandidate(candidates, roster);
        if (best) names.push(best);
      });
  } else {
    for (const rawLine of rawLines) {
      const delimitedNames = extractDelimitedOtherScreenshotNames(rawLine, roster);
      if (delimitedNames.length > 0) {
        names.push(...delimitedNames);
        continue;
      }

      const isStructuredNameLine =
        /^\s*(?:\d{1,3}|[a-z])\s*[.)\]:\-–—]+\s+/i.test(rawLine) ||
        /^\s*[•●▪︎◆◇▶︎►✓✔☑-]+\s+/.test(rawLine) ||
        OTHER_SCREENSHOT_LABEL_PATTERN.test(rawLine) ||
        /[;,/|]/.test(rawLine);

      if (!isStructuredNameLine && rawLine.split(/\s+/).length > 3) continue;

      for (const segment of splitOtherScreenshotNameSegments(rawLine)) {
        const cleaned = cleanDetectedNameCandidate(
          stripOtherScreenshotListPrefix(segment),
        );
        if (cleaned && isProbablyOtherScreenshotName(cleaned, roster)) {
          names.push(cleaned);
        }
      }
    }
  }

  // Roster rescue is useful in crop mode too, especially when OCR joins names
  // or reads a short saved name in a noisy line.
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
    [...OCR_JUNK_WORDS].some((word) => {
      // Reject junk as whole words/phrases only. Substring matching made short
      // junk like "na", "no", or "yes" block real names such as Natasha,
      // Katharina, Alanah, Noah, Nolan, or Yesim.
      if (word.length < 3) return false;
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(word)}(?=\\s|$)`);
      return pattern.test(normalized) && normalized.length <= word.length + 8;
    })
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

function isProbablyVoicePlayerName(value: string) {
  const clean = cleanOcrLine(value);
  const normalized = normalizeForMatch(clean);
  if (!clean || !normalized) return false;
  if (OCR_JUNK_WORDS.has(normalized)) return false;
  if (/\d/.test(clean)) return false;
  if (clean.length < 2 || clean.length > 36) return false;
  if (
    /\b(i|we|you|he|she|they|it|this|that|but|would|like|come|join|plan|moved|time|thing|attend|club|anymore|gathering|question|list|event|search|checked|attendees?)\b/i.test(
      clean,
    )
  )
    return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 3) return false;
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
  return sharedVoiceNameAlternates(name);
}

function playerSearchNames(player: RoomPlayer) {
  return sharedCandidateNamesForRosterPlayer(player, { includeDisplayName: true });
}

function scorePlayerMatch(ocrName: string, player: RoomPlayer) {
  return sharedScorePlayerNameMatch(ocrName, player, { includeDisplayName: true });
}

function extractOcrNames(
  text: string,
  roster: RoomPlayer[],
  mode: ScreenshotImportMode = "meetup",
): OcrNameCandidate[] {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean);
  const names: string[] = [];

  if (mode === "other") {
    names.push(...extractOtherScreenshotNames(text, roster));
  } else {
    names.push(...extractInlineMeetupNames(text));
    names.push(...extractTeamSheetNames(text, roster));
  }

  if (mode === "meetup") {
    for (let index = 0; index < lines.length; index += 1) {
      const current = normalizeForMatch(lines[index]);
      const isMeetupRoleLine =
        current === "member" ||
        current === "event host" ||
        current === "bekanntes gesicht" ||
        /^member\b/.test(current) ||
        /^event host\b/.test(current) ||
        /^bekanntes gesicht\b/.test(current);

      if (isMeetupRoleLine) {
        // Meetup attendee blocks are normally:
        //   Name
        //   Member/Event host
        //   optional RSVP comment
        // So the line before the role marker is the safest source. German
        // dark-mode screenshots can place two clean names before the first
        // "Bekanntes Gesicht" marker, so collect a short clean run there instead
        // of merging the whole run into one fake name.
        const isGermanFamiliarFaceMarker = /\bbekanntes gesicht\b/i.test(current);
        if (isGermanFamiliarFaceMarker) {
          const previousNames: string[] = [];
          for (let back = index - 1; back >= Math.max(0, index - 4); back -= 1) {
            const previous = lines[back];
            const previousNormalized = normalizeForMatch(previous);
            if (!previousNormalized) continue;
            if (MEETUP_MARKER_PATTERN.test(previousNormalized)) break;
            if (OCR_JUNK_WORDS.has(previousNormalized)) break;
            if (shouldUseMeetupAdjacentName(previous)) {
              const cleanedPrevious = cleanDetectedNameCandidate(previous);
              if (cleanedPrevious) previousNames.push(cleanedPrevious);
            }
          }
          names.push(...previousNames.reverse());
        } else {
          for (let back = index - 1; back >= Math.max(0, index - 2); back -= 1) {
            const previous = lines[back];
            const previousNormalized = normalizeForMatch(previous);
            if (MEETUP_MARKER_PATTERN.test(previousNormalized)) break;
            if (shouldUseMeetupAdjacentName(previous)) {
              const cleanedPrevious = cleanDetectedNameCandidate(previous);
              if (cleanedPrevious) names.push(cleanedPrevious);
              break;
            }
          }
        }

        // Some mobile OCR reads the grey role line before the bold name, e.g.
        // "Member ee" then "Tany". Rescue only very clean next lines, and keep
        // common RSVP comments such as "Understood" blocked.
        const next = lines[index + 1];
        if (next && shouldUseMeetupAdjacentName(next)) {
          const cleanedNext = cleanDetectedNameCandidate(next);
          if (cleanedNext) names.push(cleanedNext);
        }
      }
    }

    // Review-only fallback: if the strict Meetup parser found almost nothing,
    // promote clean standalone OCR name lines into Review Names. This does not
    // auto-select or auto-add new players, so old successful scans keep their
    // existing path and uncertain names stay user-confirmed.
    if (names.length < 2) {
      names.push(...extractLooseOcrReviewNames(lines));
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

  const cleanedNames = names
    .map((name) => cleanDetectedNameCandidate(name))
    .filter(
      (name) =>
        name && (isProbablyName(name) || isProbablySingleUsername(name)),
    );

  const uniqueNames = Array.from(
    new Map(
      cleanedNames.map((name) => [normalizeForMatch(name), name]),
    ).values(),
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
      (suggestion) =>
        suggestion.score >= Math.max(78, (candidate.score ?? 0) - 8),
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

function makeOcrReviewCandidateFromName(
  name: string,
  roster: RoomPlayer[],
): OcrNameCandidate {
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
      status: "match",
      bestMatch: exactMatches[0].player,
      score: 100,
      suggestions: ranked.slice(0, 5),
    };
  }

  if (exactMatches.length > 1) {
    return {
      name,
      status: "suggest",
      bestMatch: exactMatches[0].player,
      score: 100,
      suggestions: exactMatches.slice(0, 5),
    };
  }

  if (best && best.score >= matchThreshold) {
    return {
      name,
      status: "match",
      bestMatch: best.player,
      score: best.score,
      suggestions: ranked.slice(0, 5),
    };
  }

  if (best && best.score >= suggestThreshold) {
    return {
      name,
      status: "suggest",
      bestMatch: best.player,
      score: best.score,
      suggestions: ranked.slice(0, 5),
    };
  }

  return { name, status: "new", suggestions: ranked.slice(0, 5) };
}

function isManuallyTypedOcrName(value: string) {
  const clean = cleanOcrLine(value);
  const normalized = normalizeForMatch(clean);
  if (!clean || !normalized) return false;
  if (OCR_JUNK_WORDS.has(normalized)) return false;
  if (/\d/.test(clean)) return false;
  if (clean.length > 36) return false;

  // Manual rescue should allow real short nicknames such as “Q”.
  // Keep this permission only for user-typed names, not automatic OCR.
  if (/^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(clean)) return true;

  if (clean.length < 2) return false;
  if (
    isProbablyName(clean) ||
    isProbablySingleUsername(clean) ||
    isProbablyVoicePlayerName(clean)
  ) {
    return true;
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (words.some((word) => word.length === 1 && words.length > 1)) return false;
  if (
    /\b(i|we|you|he|she|they|it|this|that|but|would|like|come|join|plan|moved|time|thing|attend|club|anymore|gathering|question|list|event|search|checked|attendees?)\b/i.test(
      clean,
    )
  ) {
    return false;
  }

  return /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'-]{1,35}$/.test(clean);
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
    .sort(
      (a, b) =>
        b.tokens.length - a.tokens.length || b.alias.length - a.alias.length,
    );

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
  const hasExplicitSeparators =
    /[,，、;；|/\n\r]/.test(text) ||
    /\s+(?:and|und|그리고|랑|하고)\s+/i.test(text);
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
    if (
      !cleaned ||
      !key ||
      output.some((existing) => normalizeForMatch(existing) === key)
    )
      continue;
    output.push(cleaned);
  }
  return output.join(", ");
}

function mergeVoiceNameText(
  currentText: string,
  nextNames: string[],
  roster: RoomPlayer[],
) {
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
      if (
        !namesWithAlternates.some(
          (existing) => normalizeForMatch(existing) === key,
        )
      ) {
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
  onReviewNewPlayers,
  onOcrOpenHandled,
  rosterChoices = [],
  activeRosterId,
  onChooseRoster,
  todayRosterChosen = false,
  onTodayRosterChosen,
  onChooseEmptyRoster,
  onOpenRosterPicker,
}: {
  players: RoomPlayer[];
  setPlayers: (players: RoomPlayer[]) => void;
  themeColor?: string;
  openOcrToken?: number;
  ocrImportContext?: "today" | "roster";
  onOcrImportContextChange?: (context: "today" | "roster") => void;
  onAddPlayerManually?: () => void;
  onReviewNewPlayers?: (playerIds: string[]) => void;
  onOcrOpenHandled?: () => void;
  rosterChoices?: RoomRoster[];
  activeRosterId?: string;
  onChooseRoster?: (rosterId: string) => void;
  todayRosterChosen?: boolean;
  onTodayRosterChosen?: () => void;
  onChooseEmptyRoster?: () => void;
  onOpenRosterPicker?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceInterimText, setVoiceInterimText] = useState("");
  const [voiceExpectedAttendeeCount, setVoiceExpectedAttendeeCount] =
    useState("");
  const [quickVoiceOpen, setQuickVoiceOpen] = useState(false);
  const [quickVoiceHeard, setQuickVoiceHeard] = useState("");
  const [quickVoiceListening, setQuickVoiceListening] = useState(false);
  const [quickVoiceStatus, setQuickVoiceStatus] = useState("");
  const quickRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceShouldListenRef = useRef(false);
  const [sharedRosterUser, setSharedRosterUser] = useState<SharedRosterUser | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setSharedRosterUser(nextUser);
    });
    return unsubscribe;
  }, []);

  const [ocrInputSource, setOcrInputSource] = useState<
    "screenshot" | "voiceText"
  >("screenshot");
  const [screenshotImportMode, setScreenshotImportMode] =
    useState<ScreenshotImportMode>("meetup");
  const [selectedScreenshots, setSelectedScreenshots] = useState<File[]>([]);
  const [ocrScreenshotReport, setOcrScreenshotReport] = useState<OcrScreenshotReport[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [confirmNewPlayersOpen, setConfirmNewPlayersOpen] = useState(false);
  const [expectedAttendeeCount, setExpectedAttendeeCount] = useState("");
  const [showRawOcrText, setShowRawOcrText] = useState(false);
  const [manualRawOcrName, setManualRawOcrName] = useState("");
  const [manualOcrCandidateNames, setManualOcrCandidateNames] = useState<
    string[]
  >([]);
  const [rawOcrAddedNames, setRawOcrAddedNames] = useState<string[]>([]);
  const [rawOcrCreatedPlayerIds, setRawOcrCreatedPlayerIds] = useState<
    string[]
  >([]);
  const [newOcrPlayerGenders, setNewOcrPlayerGenders] = useState<
    Record<string, Gender>
  >({});
  const [editedOcrCandidateNames, setEditedOcrCandidateNames] = useState<
    Record<string, string>
  >({});
  const [editedOcrTokenSelections, setEditedOcrTokenSelections] = useState<
    Record<string, boolean[]>
  >({});
  const [prioritizeScannedPlayers, setPrioritizeScannedPlayers] =
    useState(false);
  const todayRosterReady = rosterChoices.length === 0 || todayRosterChosen;

  const attendingSummaryStyle = {
    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)",
  } as React.CSSProperties;
  const [selectedScreenshotPreviews, setSelectedScreenshotPreviews] = useState<
    Array<{ name: string; url: string }>
  >([]);
  const [scannedThumbnailsExpanded, setScannedThumbnailsExpanded] =
    useState(false);
  const [activeCropIndex, setActiveCropIndex] = useState(0);
  const [cropBoxes, setCropBoxes] = useState<Record<number, CropBox>>({});
  const [secondaryCropBoxes, setSecondaryCropBoxes] = useState<Record<number, CropBox>>({});
  const [useTwoOtherCropAreas, setUseTwoOtherCropAreas] = useState(false);
  const [activeCropArea, setActiveCropArea] = useState<0 | 1>(0);
  const [cropHelpOpen, setCropHelpOpen] = useState(false);
  const cropSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cropPreviewFrameRef = useRef<HTMLDivElement | null>(null);
  const [cropPreviewFrameSize, setCropPreviewFrameSize] = useState({
    width: 0,
    height: 0,
  });
  const [cropImageNaturalSizes, setCropImageNaturalSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [cropDragStart, setCropDragStart] = useState<{
    index: number;
    area: 0 | 1;
    x: number;
    y: number;
    mode: CropDragMode;
    handle?: CropResizeHandle;
    startBox?: CropBox;
  } | null>(null);
  const [draftCropBox, setDraftCropBox] = useState<CropBox | null>(null);
  const [newPlayerReviewPrompt, setNewPlayerReviewPrompt] = useState<{
    playerIds: string[];
    count: number;
  } | null>(null);

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
  const notHereYetCount = players.filter(
    (p) => p.attending && isNotHereYet(p),
  ).length;
  const hereNowCount = selectedCount - notHereYetCount;
  const quickVoiceCleanName = cleanOcrLine(quickVoiceHeard);
  const quickVoiceCandidates = useMemo(() => {
    const spokenName = cleanOcrLine(quickVoiceHeard);
    if (!spokenName) {
      return [] as Array<{
        player: RoomPlayer;
        score: number;
        matchedName: string;
        isAlternate: boolean;
      }>;
    }

    const spokenKey = normalizeForMatch(spokenName);
    const namesToTry = Array.from(
      new Map(
        [spokenName, ...voiceNameAlternates(spokenName)]
          .map((name) => [normalizeForMatch(name), cleanOcrLine(name)] as const)
          .filter(([key, name]) => Boolean(key && name)),
      ).values(),
    );

    return players
      .map((player) => {
        const best = namesToTry.reduce(
          (currentBest, name) => {
            const score = scorePlayerMatch(name, player);
            if (score <= currentBest.score) return currentBest;
            return {
              score,
              matchedName: name,
              isAlternate: normalizeForMatch(name) !== spokenKey,
            };
          },
          { score: 0, matchedName: spokenName, isAlternate: false },
        );
        return { player, ...best };
      })
      .filter((match) => match.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [quickVoiceHeard, players]);
  const quickVoiceCanAddNew = useMemo(() => {
    const cleanedName = quickVoiceCleanName;
    const normalizedName = normalizeForMatch(cleanedName);
    if (
      !cleanedName ||
      !normalizedName ||
      !isProbablyVoicePlayerName(cleanedName)
    )
      return false;
    return !players.some((player) =>
      playerSearchNames(player).includes(normalizedName),
    );
  }, [quickVoiceCleanName, players]);

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
  const possibleNames = useMemo(() => {
    const extractedCandidates = ocrText
      ? extractOcrNames(
          ocrText,
          players,
          ocrInputSource === "screenshot" ? screenshotImportMode : "other",
        )
      : [];
    const manualCandidates = manualOcrCandidateNames
      .map((name) => makeOcrReviewCandidateFromName(name, players))
      .filter((candidate) => Boolean(normalizeForMatch(candidate.name)));

    const byKey = new Map<string, OcrNameCandidate>();
    for (const candidate of extractedCandidates) {
      byKey.set(ocrCandidateKey(candidate), candidate);
    }
    for (const candidate of manualCandidates) {
      byKey.set(ocrCandidateKey(candidate), candidate);
    }
    return Array.from(byKey.values());
  }, [
    ocrText,
    players,
    manualOcrCandidateNames,
    ocrInputSource,
    screenshotImportMode,
  ]);
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

        const rawSuggestions = splitOtherScreenshotNameSegments(cleaned)
          .map((segment) =>
            cleanDetectedNameCandidate(stripOtherScreenshotListPrefix(segment)),
          )
          .filter((name) => {
            const normalizedName = normalizeForMatch(name);
            if (!name || !normalizedName) return false;
            if (OTHER_SCREENSHOT_JUNK_WORDS.has(normalizedName)) return false;
            if (possibleNames.some((candidate) => normalizeForMatch(candidate.name) === normalizedName)) return false;
            return isManuallyTypedOcrName(name);
          });

        const uniqueRawSuggestions = Array.from(new Map(
          rawSuggestions.map((name) => [normalizeForMatch(name), name]),
        ).values());

        const cleanedSuggestedName = cleanDetectedNameCandidate(
          stripOtherScreenshotListPrefix(cleaned),
        );
        const looksLikeStandaloneName =
          isProbablyName(cleanedSuggestedName) && !alreadyPromoted;

        return {
          index,
          text: cleaned,
          normalized: normalizedLine,
          foundCandidates,
          suggestedName: looksLikeStandaloneName ? cleanedSuggestedName : uniqueRawSuggestions[0] ?? "",
          rawSuggestions: uniqueRawSuggestions,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aEntry = a as { suggestedName: string; foundCandidates: OcrNameCandidate[]; index: number };
        const bEntry = b as { suggestedName: string; foundCandidates: OcrNameCandidate[]; index: number };
        const aHasAdd = Boolean(aEntry.suggestedName);
        const bHasAdd = Boolean(bEntry.suggestedName);
        if (aHasAdd !== bHasAdd) return aHasAdd ? -1 : 1;

        // Keep already-detected review lines useful, but below missed-name Add rows.
        const aInReview = aEntry.foundCandidates.length > 0;
        const bInReview = bEntry.foundCandidates.length > 0;
        if (aInReview !== bInReview) return aInReview ? -1 : 1;

        return aEntry.index - bEntry.index;
      }) as Array<{
      index: number;
      text: string;
      normalized: string;
      foundCandidates: OcrNameCandidate[];
      suggestedName: string;
      rawSuggestions: string[];
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
    if (chosenOcrMatchIds[ocrCandidateKey(candidate)] === "__new__")
      return "new";
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

  const getOcrNameTokens = (candidate: OcrNameCandidate) =>
    cleanOcrLine(candidate.name).split(/\s+/).filter(Boolean);

  const getDefaultOcrTokenSelection = (candidate: OcrNameCandidate) => {
    const tokens = getOcrNameTokens(candidate);

    return tokens.map((token, index) => {
      if (ocrInputSource !== "screenshot" || tokens.length <= 1) return true;

      const key = tokenKey(token);
      const nextKey = tokenKey(tokens[index + 1] ?? "");

      // In first-time screenshot imports, OCR often glues normal UI/comment
      // words to the bold attendee name. Preselect the likely name words, but
      // keep every word visible as a tap-to-restore chip so real names like
      // "Abou George" are not silently destroyed.
      if (index === 0 && (key === "about" || key === "could")) return false;
      if (index === 0 && OCR_REVIEW_LEADING_NAME_NOISE.has(key)) return false;
      if (
        index === tokens.length - 1 &&
        OCR_REVIEW_TRAILING_NAME_NOISE.has(key)
      )
        return false;
      if (index === 0 && key === "see" && nextKey === "more") return false;
      if (index === 1 && tokenKey(tokens[0]) === "see" && key === "more")
        return false;

      return true;
    });
  };

  const getOcrTokenSelection = (candidate: OcrNameCandidate) => {
    const key = ocrCandidateKey(candidate);
    const tokens = getOcrNameTokens(candidate);
    const savedSelection = editedOcrTokenSelections[key];

    if (savedSelection && savedSelection.length === tokens.length) {
      return savedSelection;
    }

    return getDefaultOcrTokenSelection(candidate);
  };

  const buildOcrNameFromTokens = (
    candidate: OcrNameCandidate,
    selection: boolean[],
  ) => {
    const tokens = getOcrNameTokens(candidate);
    const keptTokens = tokens.filter((_, index) => selection[index]);
    return titleCaseName(cleanOcrLine(keptTokens.join(" ")));
  };

  const getEditedOcrCandidateName = (candidate: OcrNameCandidate) => {
    const key = ocrCandidateKey(candidate);
    const editedName = editedOcrCandidateNames[key];

    if (editedName !== undefined) {
      return cleanDetectedNameCandidate(editedName) || cleanOcrLine(editedName);
    }

    const tokenName = buildOcrNameFromTokens(
      candidate,
      getOcrTokenSelection(candidate),
    );
    return cleanDetectedNameCandidate(tokenName) || cleanOcrLine(tokenName);
  };

  const updateEditedOcrCandidateName = (
    candidate: OcrNameCandidate,
    name: string,
  ) => {
    const key = ocrCandidateKey(candidate);
    setEditedOcrCandidateNames((current) => ({ ...current, [key]: name }));
  };

  const toggleOcrCandidateToken = (
    candidate: OcrNameCandidate,
    tokenIndex: number,
  ) => {
    const key = ocrCandidateKey(candidate);
    const currentSelection = getOcrTokenSelection(candidate);
    const nextSelection = currentSelection.map((selected, index) =>
      index === tokenIndex ? !selected : selected,
    );
    const nextName = buildOcrNameFromTokens(candidate, nextSelection);

    setEditedOcrTokenSelections((current) => ({
      ...current,
      [key]: nextSelection,
    }));
    setEditedOcrCandidateNames((current) => ({ ...current, [key]: nextName }));
  };

  const reviewNames = useMemo(() => {
    const byReviewIdentity = new Map<string, OcrNameCandidate>();

    for (const candidate of possibleNames) {
      const resolvedMatch = resolveOcrMatch(candidate);
      const editedName = getEditedOcrCandidateName(candidate);
      const normalizedEditedName = normalizeForMatch(editedName);
      const reviewIdentity = resolvedMatch
        ? `roster:${resolvedMatch.id}`
        : `new:${normalizedEditedName || normalizeForMatch(candidate.name)}`;
      if (!reviewIdentity || reviewIdentity === "new:") continue;

      const existing = byReviewIdentity.get(reviewIdentity);
      if (!existing) {
        byReviewIdentity.set(reviewIdentity, candidate);
        continue;
      }

      const existingStatus = getOcrReviewStatus(existing);
      const candidateStatus = getOcrReviewStatus(candidate);
      const statusRank: Record<OcrMatchStatus, number> = {
        match: 3,
        suggest: 2,
        new: 1,
      };
      const existingScore = existing.score ?? 0;
      const candidateScore = candidate.score ?? 0;
      const existingNameLength = getEditedOcrCandidateName(existing).length;
      const candidateNameLength = editedName.length;

      if (
        statusRank[candidateStatus] > statusRank[existingStatus] ||
        (statusRank[candidateStatus] === statusRank[existingStatus] &&
          candidateScore > existingScore) ||
        (statusRank[candidateStatus] === statusRank[existingStatus] &&
          candidateScore === existingScore &&
          candidateNameLength < existingNameLength)
      ) {
        byReviewIdentity.set(reviewIdentity, candidate);
      }
    }

    return Array.from(byReviewIdentity.values());
  }, [
    possibleNames,
    chosenOcrMatchIds,
    editedOcrCandidateNames,
    editedOcrTokenSelections,
    rawOcrCreatedPlayerIds,
    players,
  ]);

  const safeMatches = reviewNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "match",
  ).length;
  const suggestions = reviewNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "suggest",
  ).length;
  const newNames = reviewNames.filter(
    (candidate) => getOcrReviewStatus(candidate) === "new",
  ).length;
  const selectedOcrCandidates = reviewNames.filter((candidate) =>
    selectedOcrCandidateKeySet.has(ocrCandidateKey(candidate)),
  );
  const selectedRosterMatches = selectedOcrCandidates.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const selectedNewCandidates = selectedOcrCandidates.filter(
    (candidate) =>
      getOcrReviewStatus(candidate) === "new" && !resolveOcrMatch(candidate),
  );
  const selectedOcrTotal =
    selectedRosterMatches.length + selectedNewCandidates.length;
  const allRosterCandidates = reviewNames.filter((candidate) =>
    Boolean(resolveOcrMatch(candidate)),
  );
  const allNewCandidates = reviewNames.filter(
    (candidate) =>
      getOcrReviewStatus(candidate) === "new" && !resolveOcrMatch(candidate),
  );
  const allOcrTotal = allRosterCandidates.length + allNewCandidates.length;
  const allSelectableOcrCandidateKeys = [
    ...allRosterCandidates,
    ...allNewCandidates,
  ].map(ocrCandidateKey);
  const allSelectableOcrSelected =
    allSelectableOcrCandidateKeys.length > 0 &&
    allSelectableOcrCandidateKeys.every((key) =>
      selectedOcrCandidateKeySet.has(key),
    );
  const expectedAttendeeNumber = Number(expectedAttendeeCount);
  const hasExpectedAttendeeNumber =
    expectedAttendeeCount.trim() !== "" &&
    Number.isFinite(expectedAttendeeNumber) &&
    expectedAttendeeNumber > 0;
  const scannedNameCount = reviewNames.length;
  const ocrRawLineCount = ocrText
    ? ocrText
        .split(/\r?\n/)
        .map((line) => cleanOcrLine(line))
        .filter((line) => Boolean(normalizeForMatch(line))).length
    : 0;
  const ocrRawWordCount = ocrText
    ? ocrText
        .split(/\s+/)
        .map((word) => cleanOcrLine(word))
        .filter((word) => Boolean(normalizeForMatch(word))).length
    : 0;
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
    setOcrScreenshotReport([]);
    setScannedThumbnailsExpanded(false);
    setShowRawOcrText(false);
    setManualRawOcrName("");
    setManualOcrCandidateNames([]);
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});
    setEditedOcrCandidateNames({});
    setEditedOcrTokenSelections({});
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
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
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
        const transcript =
          event.results?.[event.resultIndex]?.[0]?.transcript?.trim?.() ?? "";
        setQuickVoiceHeard(transcript);
        setQuickVoiceStatus(
          transcript
            ? "Choose the player to select."
            : "No name heard. Try again or type.",
        );
      };
      recognition.onerror = (event) => {
        setQuickVoiceStatus(
          event.error
            ? `Voice stopped: ${event.error}`
            : "Try again or type a name.",
        );
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

  const addQuickVoicePlayer = () => {
    const cleanedName = quickVoiceCleanName;
    const normalizedName = normalizeForMatch(cleanedName);
    if (
      !cleanedName ||
      !normalizedName ||
      !isProbablyVoicePlayerName(cleanedName)
    ) {
      setQuickVoiceStatus("Type a clean player name first.");
      return;
    }

    const existingPlayer = players.find((player) =>
      playerSearchNames(player).includes(normalizedName),
    );

    if (existingPlayer) {
      selectQuickVoicePlayer(existingPlayer);
      return;
    }

    const now = new Date().toISOString();
    const newPlayer: RoomPlayer = {
      id: createOcrPlayerId(),
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
    setQuickVoiceOpen(false);
    setQuickVoiceHeard("");
    setQuickVoiceStatus("");
  };

  const startVoiceListening = () => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus(
        "Voice is not supported in this browser. You can still paste or type names here.",
      );
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
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index];
          const transcript = result[0].transcript.trim();
          if (result.isFinal) finalText.push(transcript);
          else interimText = transcript;
        }
        setVoiceInterimText(interimText);
        if (finalText.length > 0) {
          const heardNames = splitVoiceTextIntoNameLines(
            finalText.join(" "),
            players,
          );
          setVoiceText((current) =>
            mergeVoiceNameText(current, heardNames, players),
          );
          setVoiceInterimText("");
        }
      };
      recognition.onerror = (event) => {
        if (
          voiceShouldListenRef.current &&
          (event.error === "no-speech" || event.error === "network")
        ) {
          setVoiceStatus("");
          return;
        }
        setVoiceStatus(
          event.error
            ? `Voice stopped: ${event.error}`
            : "Voice stopped. You can try again or type names manually.",
        );
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
      setVoiceStatus(
        "Voice could not start. You can still paste or type names here.",
      );
      setVoiceListening(false);
    }
  };

  const syncVoiceReviewText = (nextText = voiceText) => {
    const reviewInput = makeVoiceTextReviewInput(nextText, players);
    setOcrInputSource("voiceText");
    setOcrText(reviewInput);
    setOcrProgress(reviewInput.trim() ? 100 : 0);
    setOcrStatus(
      reviewInput.trim()
        ? "Voice/Text list ready. Import from this screen."
        : "",
    );
    return reviewInput;
  };

  const reviewVoiceText = () => {
    const reviewInput = syncVoiceReviewText();
    if (!reviewInput.trim()) {
      setVoiceStatus("Type or say at least one clean player name first.");
      return;
    }
    stopVoiceListening();
    setVoiceStatus(
      "Review the matches below, edit the text box if needed, then import selected names.",
    );
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
    if (openOcrToken > 0) {
      openOcrImport();
      onOcrOpenHandled?.();
    }
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
    const manualCandidateKeySet = new Set(
      manualOcrCandidateNames
        .map((name) => normalizeForMatch(name))
        .filter(Boolean),
    );
    const validReviewKeys = new Set(reviewNames.map(ocrCandidateKey));
    const autoSelectedKeys = reviewNames
      .filter((candidate) => {
        if (manualCandidateKeySet.has(normalizeForMatch(candidate.name)))
          return true;
        if (candidate.status === "match" && candidate.bestMatch) return true;
        if (
          voiceOpen &&
          ocrInputSource === "voiceText" &&
          candidate.status === "new"
        )
          return true;
        return false;
      })
      .map(ocrCandidateKey);

    setSelectedOcrCandidateKeys((current) => {
      // Keep the user's current Review Names selection while OCR candidates are
      // being re-built. Adding a missed name from Raw OCR can temporarily change
      // the review list; filtering here made already-selected cards disappear.
      // Stale keys are harmless because selectedOcrCandidates is derived from
      // the current reviewNames list.
      const next = new Set(current);
      autoSelectedKeys.forEach((key) => next.add(key));
      return Array.from(next);
    });
  }, [reviewNames, voiceOpen, ocrInputSource, manualOcrCandidateNames]);

  const clearOcrSelection = () => {
    setSelectedScreenshots([]);
    setActiveCropIndex(0);
    setCropBoxes({});
    setSecondaryCropBoxes({});
    setUseTwoOtherCropAreas(false);
    setActiveCropArea(0);
    setCropHelpOpen(false);
    setCropDragStart(null);
    setDraftCropBox(null);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("");
    setSelectedOcrCandidateKeys([]);
    setChosenOcrMatchIds({});
    setExpectedAttendeeCount("");
    setShowRawOcrText(false);
    setManualRawOcrName("");
    setManualOcrCandidateNames([]);
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});
    setEditedOcrCandidateNames({});
    setEditedOcrTokenSelections({});
  };

  useEffect(() => {
    const frame = cropPreviewFrameRef.current;
    if (!frame) return;

    const updateFrameSize = () => {
      const rect = frame.getBoundingClientRect();
      setCropPreviewFrameSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateFrameSize();

    const ResizeObserverConstructor =
      typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(updateFrameSize)
      : null;

    resizeObserver?.observe(frame);
    window.addEventListener("resize", updateFrameSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateFrameSize);
    };
  }, [
    activeCropIndex,
    selectedScreenshotPreviews.length,
    screenshotImportMode,
    ocrText,
    ocrRunning,
    cropHelpOpen,
    useTwoOtherCropAreas,
  ]);

  const activeCropDisplaySize = useMemo(() => {
    const natural = cropImageNaturalSizes[activeCropIndex];
    const frameWidth = cropPreviewFrameSize.width;
    const frameHeight = cropPreviewFrameSize.height;

    if (!natural || !natural.width || !natural.height || !frameWidth || !frameHeight) {
      return null;
    }

    const scale = Math.min(
      frameWidth / natural.width,
      frameHeight / natural.height,
    );

    if (!Number.isFinite(scale) || scale <= 0) return null;

    return {
      width: Math.max(1, Math.floor(natural.width * scale)),
      height: Math.max(1, Math.floor(natural.height * scale)),
    };
  }, [activeCropIndex, cropImageNaturalSizes, cropPreviewFrameSize]);

  const clampCropBox = (box: CropBox): CropBox => {
    const w = Math.min(100, Math.max(0, box.w));
    const h = Math.min(100, Math.max(0, box.h));
    return {
      x: Math.min(100 - w, Math.max(0, box.x)),
      y: Math.min(100 - h, Math.max(0, box.y)),
      w,
      h,
    };
  };

  const getCropBoxForArea = (index: number, area: 0 | 1) =>
    area === 1 ? secondaryCropBoxes[index] : cropBoxes[index];

  const saveCropBoxForArea = (index: number, area: 0 | 1, box: CropBox) => {
    const setter = area === 1 ? setSecondaryCropBoxes : setCropBoxes;
    setter((current) => ({ ...current, [index]: clampCropBox(box) }));
  };

  const getPointerCropPoint = (event: React.PointerEvent<HTMLElement>) => {
    const rect =
      cropSurfaceRef.current?.getBoundingClientRect() ||
      event.currentTarget.getBoundingClientRect();
    const x = Math.min(
      100,
      Math.max(0, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.min(
      100,
      Math.max(0, ((event.clientY - rect.top) / rect.height) * 100),
    );
    return { x, y };
  };

  const startCropDrag = (
    index: number,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (screenshotImportMode !== "other" || ocrRunning || ocrText) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerCropPoint(event);
    const area = useTwoOtherCropAreas ? activeCropArea : 0;
    setActiveCropIndex(index);
    setCropDragStart({ index, area, mode: "draw", ...point });
    setDraftCropBox({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const startCropMove = (
    index: number,
    area: 0 | 1,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (screenshotImportMode !== "other" || ocrRunning || ocrText) return;
    const box = getCropBoxForArea(index, area);
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerCropPoint(event);
    setActiveCropIndex(index);
    setActiveCropArea(area);
    setCropDragStart({
      index,
      area,
      mode: "move",
      startBox: box,
      ...point,
    });
    setDraftCropBox(box);
  };

  const startCropResize = (
    index: number,
    area: 0 | 1,
    handle: CropResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (screenshotImportMode !== "other" || ocrRunning || ocrText) return;
    const box = getCropBoxForArea(index, area);
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerCropPoint(event);
    setActiveCropIndex(index);
    setActiveCropArea(area);
    setCropDragStart({
      index,
      area,
      mode: "resize",
      handle,
      startBox: box,
      ...point,
    });
    setDraftCropBox(box);
  };

  const moveCropDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!cropDragStart) return;
    event.preventDefault();
    const point = getPointerCropPoint(event);

    if (cropDragStart.mode === "move" && cropDragStart.startBox) {
      const dx = point.x - cropDragStart.x;
      const dy = point.y - cropDragStart.y;
      setDraftCropBox(
        clampCropBox({
          ...cropDragStart.startBox,
          x: cropDragStart.startBox.x + dx,
          y: cropDragStart.startBox.y + dy,
        }),
      );
      return;
    }

    if (
      cropDragStart.mode === "resize" &&
      cropDragStart.startBox &&
      cropDragStart.handle
    ) {
      const minSize = 3;
      const startBox = cropDragStart.startBox;
      let left = startBox.x;
      let right = startBox.x + startBox.w;
      let top = startBox.y;
      let bottom = startBox.y + startBox.h;

      if (cropDragStart.handle.includes("w")) {
        left = Math.min(point.x, right - minSize);
      }
      if (cropDragStart.handle.includes("e")) {
        right = Math.max(point.x, left + minSize);
      }
      if (cropDragStart.handle.includes("n")) {
        top = Math.min(point.y, bottom - minSize);
      }
      if (cropDragStart.handle.includes("s")) {
        bottom = Math.max(point.y, top + minSize);
      }

      left = Math.max(0, Math.min(100 - minSize, left));
      right = Math.min(100, Math.max(minSize, right));
      top = Math.max(0, Math.min(100 - minSize, top));
      bottom = Math.min(100, Math.max(minSize, bottom));

      setDraftCropBox(
        clampCropBox({
          x: left,
          y: top,
          w: Math.max(minSize, right - left),
          h: Math.max(minSize, bottom - top),
        }),
      );
      return;
    }

    const x = Math.min(cropDragStart.x, point.x);
    const y = Math.min(cropDragStart.y, point.y);
    const w = Math.abs(point.x - cropDragStart.x);
    const h = Math.abs(point.y - cropDragStart.y);
    setDraftCropBox({ x, y, w, h });
  };

  const finishCropDrag = () => {
    if (!cropDragStart || !draftCropBox) return;
    if (draftCropBox.w >= 3 && draftCropBox.h >= 3) {
      saveCropBoxForArea(cropDragStart.index, cropDragStart.area, draftCropBox);

      if (
        cropDragStart.mode === "draw" &&
        useTwoOtherCropAreas &&
        cropDragStart.area === 0 &&
        !secondaryCropBoxes[cropDragStart.index]
      ) {
        setActiveCropArea(1);
      }
    }
    setCropDragStart(null);
    setDraftCropBox(null);
  };

  const clearActiveCrop = () => {
    if (activeCropArea === 1) {
      setSecondaryCropBoxes((current) => {
        const next = { ...current };
        delete next[activeCropIndex];
        return next;
      });
      return;
    }

    setCropBoxes((current) => {
      const next = { ...current };
      delete next[activeCropIndex];
      return next;
    });
  };

  const expandCropBoxForOcr = (cropBox: CropBox) => {
    // Give OCR a little breathing room around tight mobile crop boxes. This is
    // especially helpful for wrapped sentence lists where the second line sits
    // just below the user's crop, but keep the visible crop box unchanged.
    const extraX = Math.min(1.2, Math.max(0.45, cropBox.w * 0.015));
    const extraTop = Math.min(1.0, Math.max(0.35, cropBox.h * 0.08));
    const extraBottom =
      cropBox.h < 12
        ? Math.min(3.4, Math.max(1.4, cropBox.h * 0.35))
        : Math.min(1.4, Math.max(0.45, cropBox.h * 0.1));

    const x = Math.max(0, cropBox.x - extraX);
    const y = Math.max(0, cropBox.y - extraTop);
    const right = Math.min(100, cropBox.x + cropBox.w + extraX);
    const bottom = Math.min(100, cropBox.y + cropBox.h + extraBottom);

    return {
      x,
      y,
      w: Math.max(1, right - x),
      h: Math.max(1, bottom - y),
    };
  };

  const cropScreenshotForOcr = async (
    file: File,
    cropBox?: CropBox,
    options: { variant?: "raw" | "gray" | "threshold" | "invert" } = {},
  ) => {
    if (!cropBox || cropBox.w < 3 || cropBox.h < 3) return file;

    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

      const scanCropBox = expandCropBoxForOcr(cropBox);
      const sx = Math.round((scanCropBox.x / 100) * image.naturalWidth);
      const sy = Math.round((scanCropBox.y / 100) * image.naturalHeight);
      const sw = Math.max(
        1,
        Math.round((scanCropBox.w / 100) * image.naturalWidth),
      );
      const sh = Math.max(
        1,
        Math.round((scanCropBox.h / 100) * image.naturalHeight),
      );
      const scale = options.variant === "raw" ? 4 : 5;
      const padding = 48;
      const canvas = document.createElement("canvas");
      canvas.width = sw * scale + padding * 2;
      canvas.height = sh * scale + padding * 2;
      const context = canvas.getContext("2d");
      if (!context) return file;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.drawImage(
        image,
        sx,
        sy,
        sw,
        sh,
        padding,
        padding,
        sw * scale,
        sh * scale,
      );

      if (options.variant && options.variant !== "raw") {
        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const data = imageData.data;
        for (let offset = 0; offset < data.length; offset += 4) {
          const gray =
            0.299 * data[offset] +
            0.587 * data[offset + 1] +
            0.114 * data[offset + 2];
          let value = gray;
          if (options.variant === "gray") {
            // Gentle contrast boost. This helps colored roster text without
            // destroying thin letters.
            value = Math.max(0, Math.min(255, (gray - 180) * 2.2 + 180));
          } else if (options.variant === "threshold") {
            value = gray < 238 ? 0 : 255;
          } else if (options.variant === "invert") {
            value = gray < 238 ? 255 : 0;
          }
          data[offset] = value;
          data[offset + 1] = value;
          data[offset + 2] = value;
          data[offset + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );
      if (!blob) return file;
      return new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "")}-crop-${options.variant ?? "raw"}.png`,
        {
          type: "image/png",
        },
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const buildScreenshotReport = async (
    file: File,
    index: number,
    cropPercent: CropBox | null | undefined,
    passes: string[],
    cropAreas: CropBox[] = [],
  ): Promise<OcrScreenshotReport> => {
    const dimensions = await readImageDimensions(file);
    const usableCropAreas = cropAreas.filter(isUsableCropBox);
    return {
      index,
      name: file.name,
      type: file.type || "unknown",
      sizeBytes: file.size,
      lastModified: safeIsoDate(file.lastModified),
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
      cropPercent: cropPercent ?? null,
      cropPixelApprox: cropPercentToPixels(
        cropPercent,
        dimensions.width,
        dimensions.height,
      ),
      cropAreasPercent: usableCropAreas.length > 1 ? usableCropAreas : null,
      cropAreasPixelApprox:
        usableCropAreas.length > 1
          ? usableCropAreas.map((cropArea) =>
              cropPercentToPixels(cropArea, dimensions.width, dimensions.height),
            )
          : null,
      passes,
    };
  };

  const runOcr = async () => {
    if (selectedScreenshots.length === 0 || ocrRunning) return;

    setOcrInputSource("screenshot");
    setOcrRunning(true);
    setOcrText("");
    setOcrProgress(0);
    setOcrStatus("Starting scan…");
    setOcrScreenshotReport([]);
    setScannedThumbnailsExpanded(false);
    setManualRawOcrName("");
    setManualOcrCandidateNames([]);
    setRawOcrAddedNames([]);
    setRawOcrCreatedPlayerIds([]);
    setNewOcrPlayerGenders({});
    setEditedOcrCandidateNames({});
    setEditedOcrTokenSelections({});

    const chunks: string[] = [];
    const screenshotReports: OcrScreenshotReport[] = [];

    try {
      for (let index = 0; index < selectedScreenshots.length; index += 1) {
        const file = selectedScreenshots[index];
        setOcrStatus(
          `Reading ${index + 1} of ${selectedScreenshots.length}: ${file.name}`,
        );

        const activeCropAreas =
          screenshotImportMode === "other" && useTwoOtherCropAreas
            ? [cropBoxes[index], secondaryCropBoxes[index]].filter(
                isUsableCropBox,
              )
            : [cropBoxes[index]].filter(isUsableCropBox);
        const cropSegments =
          screenshotImportMode === "other" && activeCropAreas.length > 0
            ? activeCropAreas
            : [cropBoxes[index]];
        const passLabels =
          screenshotImportMode === "other"
            ? activeCropAreas.length > 1
              ? activeCropAreas.flatMap((_, areaIndex) => [
                  `area-${areaIndex + 1}-crop-raw`,
                  `area-${areaIndex + 1}-crop-gray`,
                  `area-${areaIndex + 1}-crop-threshold`,
                ])
              : ["crop-raw", "crop-gray", "crop-threshold"]
            : ["original", "fallback-if-empty: enlarged/inverted"];
        screenshotReports.push(
          await buildScreenshotReport(
            file,
            index,
            cropBoxes[index],
            passLabels,
            activeCropAreas,
          ),
        );

        const sources =
          screenshotImportMode === "other"
            ? (
                await Promise.all(
                  cropSegments.flatMap((cropSegment) => [
                    cropScreenshotForOcr(file, cropSegment, {
                      variant: "raw",
                    }),
                    cropScreenshotForOcr(file, cropSegment, {
                      variant: "gray",
                    }),
                    cropScreenshotForOcr(file, cropSegment, {
                      variant: "threshold",
                    }),
                  ]),
                )
              )
            : [file];

        const imageTexts: string[] = [];

        const recognizeSource = async (
          source: File,
          sourceIndex: number,
          sourceCount: number,
          label?: string,
        ) => {
          const recognizeOptions =
            screenshotImportMode === "other"
              ? ({
                  tessedit_pageseg_mode: "6",
                  preserve_interword_spaces: "1",
                  logger: (message) => {
                    if (message.status)
                      setOcrStatus(
                        `${message.status} (${index + 1}/${selectedScreenshots.length})`,
                      );
                    if (typeof message.progress === "number") {
                      const totalPasses =
                        selectedScreenshots.length * sourceCount;
                      const completedPasses =
                        index * sourceCount + sourceIndex;
                      setOcrProgress(
                        Math.round(
                          ((completedPasses + message.progress) / totalPasses) *
                            100,
                        ),
                      );
                    }
                  },
                } as any)
              : {
                  logger: (message) => {
                    if (message.status) {
                      setOcrStatus(
                        label
                          ? `${label}: ${message.status} (${index + 1}/${selectedScreenshots.length})`
                          : `${message.status} (${index + 1}/${selectedScreenshots.length})`,
                      );
                    }
                    if (typeof message.progress === "number") {
                      const imageShare = 1 / selectedScreenshots.length;
                      const completedShare = index / selectedScreenshots.length;
                      setOcrProgress(
                        Math.round(
                          (completedShare + message.progress * imageShare) *
                            100,
                        ),
                      );
                    }
                  },
                };

          const result = await Tesseract.recognize(
            source,
            "eng",
            recognizeOptions,
          );
          return result.data.text.trim();
        };

        for (
          let sourceIndex = 0;
          sourceIndex < sources.length;
          sourceIndex += 1
        ) {
          imageTexts.push(
            await recognizeSource(
              sources[sourceIndex],
              sourceIndex,
              sources.length,
            ),
          );
        }

        if (
          screenshotImportMode === "meetup" &&
          extractOcrNames(imageTexts.filter(Boolean).join("\n"), players, "meetup")
            .length === 0
        ) {
          // Do not automatically run multiple expensive fallback OCR passes here.
          // They made dark Meetup scans very slow and still did not help Stefan's
          // German screenshots. Keep the fast original OCR result plus the raw
          // debug/report output so we can fix the parser with evidence instead of
          // making every import slower.
          setOcrStatus(
            `No names found in the fast OCR pass (${index + 1}/${selectedScreenshots.length}). Open/copy the OCR report for debugging.`,
          );
        }

        chunks.push(
          `--- ${file.name} ---\n${imageTexts.filter(Boolean).join("\n")}`,
        );
      }

      setOcrScreenshotReport(screenshotReports);
      setOcrText(chunks.join("\n\n"));
      setOcrProgress(100);
      setOcrStatus(
        screenshotImportMode === "other"
          ? useTwoOtherCropAreas
            ? "Two-area crop scan complete. Review names below."
            : "Crop scan complete. Review names below."
          : "Scan complete. Review names below.",
      );
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
    const cleanedName = cleanDetectedNameCandidate(rawName);
    const normalizedName = normalizeForMatch(cleanedName);
    if (
      !cleanedName ||
      !normalizedName ||
      !isManuallyTypedOcrName(cleanedName)
    ) {
      setOcrStatus("Type a clean player name from the raw OCR text first.");
      return;
    }

    const existingReviewCandidate = possibleNames.find(
      (candidate) => normalizeForMatch(candidate.name) === normalizedName,
    );

    if (existingReviewCandidate) {
      const key = ocrCandidateKey(existingReviewCandidate);
      // If this candidate was previously edited or collapsed into a similar
      // name (for example Elli/Ella), selecting it from Raw OCR should restore
      // the name the user just chose.
      setEditedOcrCandidateNames((current) => ({
        ...current,
        [key]: cleanedName,
      }));
      setSelectedOcrCandidateKeys((current) =>
        current.includes(key) ? current : [...current, key],
      );
      setRawOcrAddedNames((current) =>
        current.includes(normalizedName)
          ? current
          : [...current, normalizedName],
      );
      setManualRawOcrName("");
      setOcrStatus(`${cleanedName} is now selected in Review Names.`);
      return;
    }

    const reviewCandidate = makeOcrReviewCandidateFromName(
      cleanedName,
      players,
    );
    const reviewKey = ocrCandidateKey(reviewCandidate);

    setManualOcrCandidateNames((current) => {
      const existing = current.some(
        (name) => normalizeForMatch(name) === normalizedName,
      );
      return existing ? current : [...current, cleanedName];
    });
    setEditedOcrCandidateNames((current) => ({
      ...current,
      [reviewKey]: cleanedName,
    }));
    setSelectedOcrCandidateKeys((current) =>
      current.includes(reviewKey) ? current : [...current, reviewKey],
    );
    setRawOcrAddedNames((current) =>
      current.includes(normalizedName) ? current : [...current, normalizedName],
    );
    setManualRawOcrName("");
    setOcrStatus(
      `${cleanedName} added to Review Names. Press Add Selected to confirm.`,
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
      (candidate) =>
        getOcrReviewStatus(candidate) === "new" && !resolveOcrMatch(candidate),
    );
    const seenNewNames = new Set<string>();
    const validNewCandidates = currentNewCandidates
      .map((candidate) => ({
        candidate,
        name: getEditedOcrCandidateName(candidate),
      }))
      .filter(({ name }) => name && isProbablyName(name))
      .filter(({ name }) => {
        const normalized = normalizeForMatch(name);
        if (!normalized || seenNewNames.has(normalized)) return false;
        seenNewNames.add(normalized);
        return true;
      });

    const playerIds = new Set(currentRosterMatches.map((player) => player.id));

    if (playerIds.size === 0 && validNewCandidates.length === 0) return;

    const now = new Date().toISOString();
    const newPlayers: RoomPlayer[] = validNewCandidates.map(
      ({ candidate, name }) => ({
        id: createOcrPlayerId(),
        roomId: 1,
        name: name.trim(),
        gender: newOcrPlayerGenders[ocrCandidateKey(candidate)] ?? "male",
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
      }),
    );

    const nextPlayers = [
      ...players.map((player) =>
        playerIds.has(player.id)
          ? { ...player, attending: true, todayStatus: "here" }
          : player,
      ),
      ...newPlayers,
    ].sort((a, b) => displayName(a).localeCompare(displayName(b)));

    setPrioritizeScannedPlayers(true);
    setPlayers(nextPlayers);
    setOcrStatus(
      `Added ${playerIds.size} existing player${playerIds.size === 1 ? "" : "s"} and created ${newPlayers.length} new player${newPlayers.length === 1 ? "" : "s"}.`,
    );
    setConfirmNewPlayersOpen(false);
    setOcrOpen(false);
    setVoiceOpen(false);
    if (newPlayers.length > 0 && onReviewNewPlayers) {
      setNewPlayerReviewPrompt({
        playerIds: newPlayers.map((player) => player.id),
        count: newPlayers.length,
      });
    }
  };

  const setNewOcrPlayerGender = (
    candidate: OcrNameCandidate,
    gender: Gender,
  ) => {
    const key = ocrCandidateKey(candidate);
    setNewOcrPlayerGenders((current) => ({ ...current, [key]: gender }));
  };

  const finalizeAddSelectedOcrMatches = () => {
    finalizeOcrCandidates(selectedOcrCandidates);
  };

  const addSelectedOcrMatches = () => {
    if (selectedOcrTotal === 0) return;
    if (selectedNewCandidates.length > 0) {
      setConfirmNewPlayersOpen(true);
      return;
    }
    finalizeAddSelectedOcrMatches();
  };

  const exportOcrReport = async () => {
    const selectedKeys = new Set(selectedOcrCandidateKeys);
    const screenshots =
      ocrScreenshotReport.length > 0
        ? ocrScreenshotReport
        : await Promise.all(
            selectedScreenshots.map((file, index) =>
              buildScreenshotReport(
                file,
                index,
                cropBoxes[index],
                screenshotImportMode === "other"
                  ? ["crop-raw", "crop-gray", "crop-threshold"]
                  : ["original"],
              ),
            ),
          );

    const candidateReports = reviewNames.map((candidate) => {
      const key = ocrCandidateKey(candidate);
      const resolvedMatch = resolveOcrMatch(candidate);
      const reviewStatus = getOcrReviewStatus(candidate);
      const tokens = getOcrNameTokens(candidate);
      const tokenSelection = getOcrTokenSelection(candidate);
      const editedName = getEditedOcrCandidateName(candidate);
      return {
        key,
        originalName: candidate.name,
        editedName,
        status: reviewStatus,
        selected: selectedKeys.has(key),
        score: candidate.score ?? null,
        resolvedMatch: resolvedMatch
          ? {
              id: resolvedMatch.id,
              name: resolvedMatch.name,
              aka: resolvedMatch.aka || null,
            }
          : null,
        suggestions: candidate.suggestions.slice(0, 5).map(({ player, score }) => ({
          id: player.id,
          name: player.name,
          aka: player.aka || null,
          score,
        })),
        tokens: tokens.map((token, index) => ({
          text: token,
          kept: tokenSelection[index] ?? true,
        })),
      };
    });

    const selectedFinalNames = selectedOcrCandidates.map((candidate) => {
      const resolvedMatch = resolveOcrMatch(candidate);
      const reviewStatus = getOcrReviewStatus(candidate);
      return {
        sourceName: candidate.name,
        finalName: resolvedMatch
          ? displayName(resolvedMatch)
          : getEditedOcrCandidateName(candidate) || candidate.name,
        type: resolvedMatch ? "existing" : reviewStatus,
        rosterPlayerId: resolvedMatch?.id ?? null,
      };
    });

    const report = {
      reportVersion: 1,
      createdAt: new Date().toISOString(),
      appArea: "Fair Teams OCR import",
      importContext: ocrImportContext,
      inputSource: ocrInputSource,
      screenshotImportMode:
        ocrInputSource === "screenshot" ? screenshotImportMode : null,
      viewport: getViewportReport(),
      screenshots,
      scan: {
        status: ocrStatus,
        progress: ocrProgress,
        expectedCount: hasExpectedAttendeeNumber
          ? Math.round(expectedAttendeeNumber)
          : null,
        rawText: ocrText,
        rawLineCount: ocrRawLineCount,
        rawWordCount: ocrRawWordCount,
        detectedReviewNameCount: reviewNames.length,
        rosterMatchCount,
        suggestionCount: suggestions,
        newNameCount: newNames,
        missingFromExpected: hasExpectedAttendeeNumber ? missingFromScan : null,
      },
      rosterAtScanTime: players.map((player) => ({
        id: player.id,
        name: player.name,
        aka: player.aka || null,
        isNew: Boolean(player.isNew),
      })),
      reviewCandidates: candidateReports,
      selectedFinalNames,
      rawLineReview: rawOcrLineEntries.map((entry) => ({
        index: entry.index,
        text: entry.text,
        normalized: entry.normalized,
        suggestedName: entry.suggestedName || null,
        rawSuggestions: entry.rawSuggestions,
        foundCandidateKeys: entry.foundCandidates.map(ocrCandidateKey),
      })),
      manualCorrections: {
        chosenMatchIds: chosenOcrMatchIds,
        editedNames: editedOcrCandidateNames,
        editedTokenSelections: editedOcrTokenSelections,
        manualCandidateNames: manualOcrCandidateNames,
        rawOcrAddedNames,
        rawOcrCreatedPlayerIds,
        selectedCandidateKeys: selectedOcrCandidateKeys,
      },
      notes:
        "No screenshot image is included. Screen and image dimensions are included because screenshot size/device size can affect OCR behavior.",
    };

    const mode =
      ocrInputSource === "screenshot"
        ? screenshotImportMode
        : "voice-text";
    const filename = `fair-teams-ocr-report-${mode}-${sanitizeReportFilenamePart(
      selectedScreenshotNames[0] || "names",
    )}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJsonFile(filename, report);
    setOcrStatus("OCR report exported.");
  };

  const selectAllOcrMatches = () => {
    if (allOcrTotal === 0) return;

    if (allSelectableOcrSelected) {
      setSelectedOcrCandidateKeys((current) =>
        current.filter((key) => !allSelectableOcrCandidateKeys.includes(key)),
      );
      setOcrStatus("Review Names selection cleared.");
      return;
    }

    setSelectedOcrCandidateKeys(allSelectableOcrCandidateKeys);
    setOcrStatus(
      "All usable Review Names are selected. Press Add Selected to confirm.",
    );
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
          ? {
              ...p,
              attending: true,
              todayStatus: isNotHereYet(p) ? "here" : "not_here_yet",
            }
          : p,
      ),
    );
  };

  const isCropWorkspaceOpen =
    ocrInputSource === "screenshot" &&
    selectedScreenshotPreviews.length > 0 &&
    !ocrText &&
    !ocrRunning &&
    screenshotImportMode === "other";

  const isMeetupScreenshotReviewOpen =
    ocrInputSource === "screenshot" &&
    selectedScreenshotNames.length > 0 &&
    !ocrText &&
    !ocrRunning &&
    !ocrStatus &&
    screenshotImportMode === "meetup";

  const activeRosterChoice =
    rosterChoices.find((roster) => roster.id === activeRosterId) || rosterChoices[0];
  const startGreetingName = organizerGreetingName(sharedRosterUser);
  const chooseRosterFromStart = (roster: RoomRoster) => {
    onChooseRoster?.(roster.id);
    onTodayRosterChosen?.();
    if (roster.players.length === 0) {
      onChooseEmptyRoster?.();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {rosterChoices.length > 0 && !todayRosterReady ? (
        <div className="space-y-3">
          <div className="px-1 pb-1 pt-2">
            <h2 className="text-2xl font-black tracking-tight text-[#102A43]">
              {startGreetingName ? `Hey, ${startGreetingName}` : "Hey,"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {startGreetingName ? "Choose where to start." : "Choose your roster."}
            </p>
          </div>

          {activeRosterChoice ? (
            <button
              type="button"
              onClick={() => chooseRosterFromStart(activeRosterChoice)}
              className={`flex w-full items-center justify-between rounded-3xl border px-4 py-4 text-left shadow-sm transition-transform active:scale-[0.99] ${isFirebaseSharedRoster(activeRosterChoice) ? "border-violet-100 bg-violet-50/70 hover:bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">Last used</span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-base font-black text-[#102A43]">{activeRosterChoice.name}</span>
                  <RosterKindBadge roster={activeRosterChoice} />
                </span>
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {activeRosterChoice.players.length === 0 ? "Empty roster" : `${activeRosterChoice.players.length} player${activeRosterChoice.players.length === 1 ? "" : "s"}`}
                </span>
              </span>
              <span className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          ) : null}

          {onOpenRosterPicker ? (
            <button
              type="button"
              onClick={onOpenRosterPicker}
              className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-transform hover:bg-slate-50 active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-black text-[#102A43]">Change roster</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                  Local and shared rosters
                </span>
              </span>
              <span className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          ) : null}
        </div>
      ) : players.length === 0 ? (
        <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 rounded-3xl border border-dashed border-primary/25 bg-primary/5 p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
            <ImageIcon className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-black tracking-tight text-[#102A43]">
            Create your first player list
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-xs font-semibold leading-relaxed text-muted-foreground">
            Fastest setup: import a Meetup, WhatsApp, Telegram, or attendee
            screenshot and create multiple players at once.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              onClick={openImportChoice}
              className="h-10 rounded-xl text-xs font-black uppercase tracking-wide"
              data-testid="empty-today-import-button"
            >
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              Screenshot Import
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
            <Button
              type="button"
              variant="outline"
              onClick={openQuickVoiceSelect}
              className={`h-10 rounded-xl text-xs font-black uppercase tracking-wide ${quickVoiceOpen || quickVoiceListening ? "border-red-300 bg-red-50 text-red-700" : ""}`}
              data-testid="empty-today-voice-add-button"
            >
              <Mic
                className={`mr-1.5 h-3.5 w-3.5 ${quickVoiceOpen || quickVoiceListening ? "animate-pulse" : ""}`}
              />
              Voice Add
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 flex items-center justify-between rounded-xl border p-3 shadow-sm"
            style={attendingSummaryStyle}
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">
                Today
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
                <span className="text-base font-black text-slate-900">
                  {selectedCount} attending
                </span>
                {notHereYetCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 leading-none text-amber-800">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-amber-700/80">Late</span>
                    <span className="text-[11px] font-black text-amber-900">{notHereYetCount}</span>
                  </span>
                )}
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
                  setPlayers(
                    players.map((p) => ({
                      ...p,
                      attending: true,
                      todayStatus: "here",
                    })),
                  );
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
                  setPlayers(
                    players.map((p) => ({
                      ...p,
                      attending: false,
                      todayStatus: "here",
                    })),
                  );
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
              className="h-10 rounded-xl border-slate-300 bg-white/85 text-[13px] font-black text-slate-700 shadow-sm hover:bg-white hover:text-slate-900"
              data-testid="today-import-button"
            >
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              Screenshot Import
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openQuickVoiceSelect}
              className={`h-10 rounded-xl text-[13px] font-black ${
                quickVoiceOpen || quickVoiceListening
                  ? "border-red-300 bg-red-50 text-red-700 shadow-sm hover:bg-red-50 hover:text-red-800"
                  : ""
              }`}
              data-testid="today-quick-voice-button"
            >
              <Mic
                className={`mr-1.5 h-3.5 w-3.5 ${quickVoiceOpen || quickVoiceListening ? "animate-pulse" : ""}`}
              />
              Voice Select
            </Button>
          </div>
        </>
      )}

      {quickVoiceOpen && (
        <div className="fixed inset-x-4 top-24 z-50 mx-auto max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${quickVoiceListening ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}
              >
                <Mic
                  className={`h-3.5 w-3.5 ${quickVoiceListening ? "animate-pulse" : ""}`}
                />
              </span>
              <span>
                {quickVoiceListening
                  ? "Say one name"
                  : quickVoiceHeard.trim()
                    ? players.length === 0
                      ? "Add player"
                      : "Choose player"
                    : players.length === 0
                      ? "Voice Add"
                      : "Voice Select"}
              </span>
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

          {!quickVoiceListening &&
            quickVoiceStatus &&
            !quickVoiceHeard.trim() && (
              <div className="mb-2 rounded-2xl bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-500">
                {quickVoiceStatus}
              </div>
            )}

          {quickVoiceHeard.trim() && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Heard / edit before adding
                </label>
                <Input
                  value={quickVoiceCleanName}
                  onChange={(event) => setQuickVoiceHeard(event.target.value)}
                  className="h-8 rounded-xl border-slate-200 bg-white text-xs font-black text-slate-900"
                  placeholder="Type one player name"
                />
              </div>

              {quickVoiceCandidates.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Roster suggestions
                  </div>
                  {quickVoiceCandidates.map(
                    ({ player, matchedName, isAlternate }, index) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => selectQuickVoicePlayer(player)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${index === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-black">
                            {displayName(player)}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-[10px] font-bold ${index === 0 ? "text-emerald-700/80" : "text-slate-400"}`}
                          >
                            {isAlternate
                              ? `Heard as “${quickVoiceCleanName}”`
                              : matchedName !== quickVoiceCleanName
                                ? `Matched “${matchedName}”`
                                : "Close match"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-black">
                          {player.attending ? "Already selected" : "Select"}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
                  {players.length === 0
                    ? "No roster yet. Add the heard name below."
                    : "No roster match found."}
                </div>
              )}

              {quickVoiceCanAddNew && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-2.5">
                  <div className="mb-2 text-[10px] font-bold leading-snug text-sky-700">
                    {quickVoiceCandidates.length > 0
                      ? "Not one of these? Add the heard name as a new player for today."
                      : players.length === 0
                        ? "Add the heard name as a new player for today."
                        : "No roster match? Add the heard name as a new player for today."}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addQuickVoicePlayer}
                    className="h-8 w-full rounded-xl border-sky-200 bg-white text-xs font-black text-sky-800 hover:bg-sky-100"
                  >
                    Add “{quickVoiceCleanName}” as new player
                  </Button>
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
          className={
            isCropWorkspaceOpen
              ? "!fixed !left-0 !top-0 !flex !h-[100dvh] !max-h-[100dvh] !w-[100dvw] !max-w-none !translate-x-0 !translate-y-0 overflow-hidden !rounded-none !border-0 !p-0 [&>button]:hidden"
              : "!fixed !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !flex h-[92svh] max-h-[calc(100svh-1rem)] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl p-4 sm:h-[90dvh] sm:max-h-[90dvh] sm:p-6 md:max-w-3xl"
          }
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
            {ocrInputSource === "screenshot" && !ocrText && (
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-2">
                <button
                  type="button"
                  onClick={() => setScreenshotImportMode("meetup")}
                  className={`rounded-lg border p-3 text-left transition ${
                    screenshotImportMode === "meetup"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-black">Meetup screenshot</div>
                  <div className="mt-1 text-[10px] font-medium">
                    Fast scan for Meetup attendee screenshots.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setScreenshotImportMode("other")}
                  className={`rounded-lg border p-3 text-left transition ${
                    screenshotImportMode === "other"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-black">Other screenshot</div>
                  <div className="mt-1 text-[10px] font-medium">
                    Crop the name area before scanning.
                  </div>
                </button>
              </div>
            )}

            {ocrInputSource === "screenshot" && !isMeetupScreenshotReviewOpen && (
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center transition-colors hover:bg-muted/70">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-xs font-black text-foreground">
                  {selectedScreenshotNames.length > 0
                    ? `${selectedScreenshotNames.length} screenshot${selectedScreenshotNames.length === 1 ? "" : "s"} selected`
                    : "Upload Screenshot(s)"}
                </div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  {screenshotImportMode === "other"
                    ? "Select one or more screenshots. You will crop each image before scanning."
                    : "Select all screenshots for one attendee list. You can select multiple screenshots from one attendee list."}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    setSelectedScreenshots(
                      Array.from(event.target.files ?? []),
                    );
                    setActiveCropIndex(0);
                    setCropBoxes({});
                    setSecondaryCropBoxes({});
                    setUseTwoOtherCropAreas(false);
                    setActiveCropArea(0);
                    setCropDragStart(null);
                    setDraftCropBox(null);
                    setOcrText("");
                    setOcrProgress(0);
                    setOcrStatus("");
                    setSelectedOcrCandidateKeys([]);
                    setChosenOcrMatchIds({});
                    setShowRawOcrText(false);
                    setManualRawOcrName("");
                    setManualOcrCandidateNames([]);
                    setRawOcrAddedNames([]);
                    setRawOcrCreatedPlayerIds([]);
                  }}
                  data-testid="ocr-file-input"
                />
              </label>
            )}

            {isMeetupScreenshotReviewOpen && (
              <div className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-background">
                <div className="shrink-0 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-black text-foreground">
                        {selectedScreenshotNames.length} screenshot
                        {selectedScreenshotNames.length === 1 ? "" : "s"}{" "}
                        selected
                      </div>
                      <div className="truncate text-xs font-semibold text-muted-foreground">
                        Check the full previews, then scan.
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearOcrSelection}
                        className="h-11 rounded-2xl px-5 text-xs font-black shadow-sm"
                      >
                        Clear
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={runOcr}
                        disabled={ocrRunning || selectedScreenshots.length === 0}
                        className="h-11 rounded-2xl px-6 text-xs font-black shadow-sm"
                      >
                        Scan
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {selectedScreenshotPreviews.map((preview, index) => (
                      <div
                        key={`${preview.name}-${index}`}
                        className="overflow-hidden rounded-2xl border bg-muted/30 shadow-sm"
                      >
                        <div className="border-b bg-background/90 px-3 py-2 text-[11px] font-black text-muted-foreground">
                          Screenshot {index + 1} of {selectedScreenshotPreviews.length}
                        </div>
                        <img
                          src={preview.url}
                          alt={preview.name}
                          className="block h-auto w-full object-contain"
                        />
                        <div className="truncate border-t bg-background/90 px-3 py-2 text-[10px] font-bold text-muted-foreground">
                          {preview.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {ocrInputSource === "screenshot" &&
              selectedScreenshotPreviews.length > 0 &&
              !ocrText &&
              !ocrRunning &&
              screenshotImportMode === "other" && (
                <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] overflow-hidden bg-background shadow-2xl">
                  <div className="flex h-full w-full flex-col gap-0 landscape:flex-row">
                    <div className="shrink-0 border-b bg-background/95 px-2.5 pb-1.5 pt-[calc(env(safe-area-inset-top)+5px)] shadow-sm backdrop-blur landscape:flex landscape:w-24 landscape:flex-col landscape:gap-1.5 landscape:border-b-0 landscape:border-r landscape:px-1.5 landscape:pb-[calc(env(safe-area-inset-bottom)+6px)] landscape:pl-[calc(env(safe-area-inset-left)+6px)] landscape:pt-1.5">
                      <div className="flex items-center justify-between gap-2 landscape:flex-col landscape:items-stretch">
                        <div className="flex min-w-0 items-center gap-1.5 landscape:justify-center">
                          <div className="truncate text-[12px] font-black leading-tight text-foreground landscape:text-center landscape:text-[11px]">
                            Crop names
                          </div>
                          <button
                            type="button"
                            onClick={() => setCropHelpOpen((value) => !value)}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition ${
                              cropHelpOpen
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-background"
                            }`}
                            aria-label="Crop instructions"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                          <div className="shrink-0 text-[10px] font-black text-muted-foreground landscape:hidden">
                            {activeCropIndex + 1}/{selectedScreenshotPreviews.length}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 landscape:grid landscape:grid-cols-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearOcrSelection}
                            className="h-8 rounded-xl px-2 text-[11px] font-black landscape:w-full landscape:px-1.5"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={runOcr}
                            disabled={
                              ocrRunning ||
                              !selectedScreenshots.every((_, screenshotIndex) =>
                                Boolean(cropBoxes[screenshotIndex]) &&
                                (!useTwoOtherCropAreas ||
                                  Boolean(secondaryCropBoxes[screenshotIndex])),
                              )
                            }
                            className="h-8 rounded-xl px-3 text-[11px] font-black shadow-sm landscape:w-full landscape:px-1.5"
                          >
                            Scan
                          </Button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 landscape:mt-0 landscape:flex-1 landscape:flex-col landscape:items-stretch landscape:overflow-x-hidden landscape:overflow-y-auto landscape:pb-0">
                        <div className="flex shrink-0 items-center gap-1 landscape:flex-col landscape:items-stretch">
                          <span className="px-0.5 text-[8px] font-black uppercase tracking-wide text-muted-foreground landscape:text-center">
                            Image
                          </span>
                          <div className="flex gap-1 landscape:flex-col">
                            {selectedScreenshotPreviews.map((preview, index) => {
                              const hasAnyCrop =
                                Boolean(cropBoxes[index]) ||
                                Boolean(secondaryCropBoxes[index]);
                              return (
                                <button
                                  key={`${preview.name}-tab-${index}`}
                                  type="button"
                                  onClick={() => setActiveCropIndex(index)}
                                  className={`h-7 min-w-7 shrink-0 rounded-full border px-2 text-[11px] font-black shadow-sm transition landscape:w-full landscape:px-1.5 ${
                                    activeCropIndex === index
                                      ? "border-primary bg-primary/10 text-primary"
                                      : hasAnyCrop
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                        : "border-border bg-background text-muted-foreground"
                                  }`}
                                  aria-label={`Screenshot ${index + 1}`}
                                >
                                  {hasAnyCrop ? "✓" : index + 1}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 landscape:flex-col landscape:items-stretch">
                          <span className="px-0.5 text-[8px] font-black uppercase tracking-wide text-muted-foreground landscape:text-center">
                            Read
                          </span>
                          <div className="flex gap-1 rounded-xl bg-muted p-0.5 landscape:w-full landscape:flex-col">
                            <button
                              type="button"
                              onClick={() => {
                                setUseTwoOtherCropAreas(false);
                                setActiveCropArea(0);
                              }}
                              className={`flex h-7 min-w-8 items-center justify-center rounded-lg px-1.5 text-[10px] font-black transition landscape:w-full ${
                                !useTwoOtherCropAreas
                                  ? "bg-background text-primary shadow-sm"
                                  : "text-muted-foreground"
                              }`}
                              aria-label="Read one list"
                              title="Read one list"
                            >
                              <span className="flex h-4 w-5 items-center justify-center rounded border border-current/40 text-[9px] leading-none">1</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUseTwoOtherCropAreas(true);
                                // If the user already drew the first list as a
                                // single crop, jump straight to List 2 so they
                                // can draw the second rectangle immediately.
                                setActiveCropArea(cropBoxes[activeCropIndex] ? 1 : 0);
                              }}
                              className={`flex h-7 min-w-8 items-center justify-center rounded-lg px-1.5 text-[10px] font-black transition landscape:w-full ${
                                useTwoOtherCropAreas
                                  ? "bg-background text-primary shadow-sm"
                                  : "text-muted-foreground"
                              }`}
                              aria-label="Read two lists"
                              title="Read two lists"
                            >
                              <span className="flex h-4 w-5 items-center justify-center rounded border border-current/40 text-[9px] leading-none">2</span>
                            </button>
                          </div>
                        </div>

                        {useTwoOtherCropAreas && (
                          <div className="flex shrink-0 items-center gap-1 landscape:flex-col landscape:items-stretch">
                            <span className="px-0.5 text-[8px] font-black uppercase tracking-wide text-muted-foreground landscape:text-center">
                              Box
                            </span>
                            <div className="flex gap-1 rounded-xl bg-muted p-0.5 landscape:w-full landscape:flex-col">
                              {[0, 1].map((area) => {
                                const saved = area === 1
                                  ? Boolean(secondaryCropBoxes[activeCropIndex])
                                  : Boolean(cropBoxes[activeCropIndex]);
                                return (
                                  <button
                                    key={`crop-area-${area}`}
                                    type="button"
                                    onClick={() => setActiveCropArea(area as 0 | 1)}
                                    className={`flex h-7 min-w-8 items-center justify-center rounded-lg px-1.5 text-[10px] font-black transition landscape:w-full ${
                                      activeCropArea === area
                                        ? area === 0
                                          ? "bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-200"
                                          : "bg-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200"
                                        : saved
                                          ? "bg-background text-emerald-700"
                                          : "text-muted-foreground"
                                    }`}
                                    aria-label={`Box ${area + 1}`}
                                    title={`Box ${area + 1}`}
                                  >
                                    {saved ? "✓" : area + 1}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearActiveCrop}
                          disabled={
                            activeCropArea === 1
                              ? !secondaryCropBoxes[activeCropIndex]
                              : !cropBoxes[activeCropIndex]
                          }
                          className="ml-auto h-7 shrink-0 rounded-xl px-2 text-[10px] font-black shadow-sm landscape:ml-0 landscape:mt-auto landscape:w-full landscape:px-1.5"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {cropHelpOpen && (
                      <div className="pointer-events-none absolute left-2 right-2 top-[calc(env(safe-area-inset-top)+48px)] z-30 rounded-2xl border border-sky-100 bg-sky-50/95 px-3 py-2 text-[10px] font-bold leading-snug text-sky-900 shadow-lg backdrop-blur landscape:left-[calc(env(safe-area-inset-left)+6.3rem)] landscape:right-2 landscape:top-2 landscape:max-w-sm">
                        Drag to select where names are. Use <b>Image 1/2</b> to switch screenshots. If names are in separate areas, like two columns, choose <b>Read: 2</b>, then draw <b>Box 1</b> and <b>Box 2</b> separately.
                      </div>
                    )}

                    {selectedScreenshotPreviews[activeCropIndex] && (
                      <>
                        <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-950">
                          <div
                            ref={cropPreviewFrameRef}
                            className="flex h-full w-full items-center justify-center overflow-hidden"
                          >
                            <div
                              ref={cropSurfaceRef}
                              className="relative touch-none overflow-hidden"
                              style={
                                activeCropDisplaySize
                                  ? {
                                      width: `${activeCropDisplaySize.width}px`,
                                      height: `${activeCropDisplaySize.height}px`,
                                    }
                                  : {
                                      width: "100%",
                                      height: "100%",
                                    }
                              }
                              onPointerDown={(event) =>
                                startCropDrag(activeCropIndex, event)
                              }
                              onPointerMove={moveCropDrag}
                              onPointerUp={finishCropDrag}
                              onPointerCancel={finishCropDrag}
                            >
                              <img
                                src={
                                  selectedScreenshotPreviews[activeCropIndex]
                                    .url
                                }
                                alt={
                                  selectedScreenshotPreviews[activeCropIndex]
                                    .name
                                }
                                className="absolute inset-0 block h-full w-full select-none object-contain"
                                draggable={false}
                                onLoad={(event) => {
                                  const image = event.currentTarget;
                                  const naturalWidth = image.naturalWidth || 0;
                                  const naturalHeight = image.naturalHeight || 0;
                                  if (!naturalWidth || !naturalHeight) return;
                                  setCropImageNaturalSizes((current) => {
                                    const existing = current[activeCropIndex];
                                    if (
                                      existing?.width === naturalWidth &&
                                      existing?.height === naturalHeight
                                    ) {
                                      return current;
                                    }
                                    return {
                                      ...current,
                                      [activeCropIndex]: {
                                        width: naturalWidth,
                                        height: naturalHeight,
                                      },
                                    };
                                  });
                                }}
                              />
                              {(() => {
                                const areas = [
                                  {
                                    area: 0 as const,
                                    label: "List 1",
                                    box:
                                      cropDragStart?.index === activeCropIndex &&
                                      cropDragStart.area === 0 &&
                                      draftCropBox
                                        ? draftCropBox
                                        : cropBoxes[activeCropIndex],
                                  },
                                  {
                                    area: 1 as const,
                                    label: "List 2",
                                    box:
                                      useTwoOtherCropAreas &&
                                      cropDragStart?.index === activeCropIndex &&
                                      cropDragStart.area === 1 &&
                                      draftCropBox
                                        ? draftCropBox
                                        : useTwoOtherCropAreas
                                          ? secondaryCropBoxes[activeCropIndex]
                                          : undefined,
                                  },
                                ].filter((item) => Boolean(item.box));

                                return (
                                  <>
                                    {areas.length === 0 && (
                                      <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl bg-slate-950/70 px-3 py-2 text-center text-[11px] font-bold text-white shadow-lg">
                                        {useTwoOtherCropAreas
                                          ? `Drag around List ${activeCropArea + 1}.`
                                          : "Drag around the names you want Fair Teams to read."}
                                      </div>
                                    )}
                                    {areas.map(({ area, label, box }) => {
                                      const isActive =
                                        !useTwoOtherCropAreas ||
                                        activeCropArea === area;
                                      const boxTone =
                                        area === 0
                                          ? {
                                              border: "border-teal-400",
                                              fill: "bg-teal-300/15",
                                              badge: "bg-teal-500 text-white",
                                              handle: "bg-teal-400 ring-teal-100",
                                            }
                                          : {
                                              border: "border-orange-400",
                                              fill: "bg-orange-300/15",
                                              badge: "bg-orange-400 text-slate-950",
                                              handle: "bg-orange-400 ring-orange-100",
                                            };
                                      const handles: Array<{
                                        handle: CropResizeHandle;
                                        className: string;
                                      }> = [
                                        { handle: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
                                        { handle: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
                                        { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
                                        { handle: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
                                      ];
                                      return (
                                        <div
                                          key={`crop-overlay-${area}`}
                                          className={`absolute border-2 shadow-[0_0_0_9999px_rgba(15,23,42,0.20)] ${boxTone.border} ${boxTone.fill} ${
                                            isActive ? "pointer-events-auto" : "pointer-events-auto opacity-80"
                                          }`}
                                          style={{
                                            left: `${box!.x}%`,
                                            top: `${box!.y}%`,
                                            width: `${box!.w}%`,
                                            height: `${box!.h}%`,
                                          }}
                                          onPointerDown={(event) =>
                                            startCropMove(activeCropIndex, area, event)
                                          }
                                        >
                                          <span
                                            className={`pointer-events-none absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-black shadow-sm ${boxTone.badge}`}
                                          >
                                            {useTwoOtherCropAreas ? label : "List"}
                                          </span>
                                          {isActive &&
                                            handles.map(({ handle, className }) => (
                                              <button
                                                key={`crop-handle-${area}-${handle}`}
                                                type="button"
                                                aria-label={`Resize ${label}`}
                                                className={`absolute h-3.5 w-3.5 rounded-full ${boxTone.handle} shadow-sm ring-1 ${className}`}
                                                onPointerDown={(event) =>
                                                  startCropResize(
                                                    activeCropIndex,
                                                    area,
                                                    handle,
                                                    event,
                                                  )
                                                }
                                              />
                                            ))}
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            {ocrInputSource === "screenshot" &&
              selectedScreenshotNames.length > 0 &&
              (ocrRunning || ocrStatus || ocrText) && (
                <div className="rounded-xl border bg-muted/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs font-black text-foreground">
                      ✓ {selectedScreenshotNames.length} screenshot
                      {selectedScreenshotNames.length === 1 ? "" : "s"}{" "}
                      {ocrText ? "scanned" : "loaded"}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {selectedScreenshotPreviews.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setScannedThumbnailsExpanded((open) => !open)
                          }
                          className="h-7 w-7 rounded-lg text-muted-foreground"
                          aria-label={
                            scannedThumbnailsExpanded
                              ? "Hide uploaded screenshots"
                              : "Show uploaded screenshots"
                          }
                          title={
                            scannedThumbnailsExpanded
                              ? "Hide screenshots"
                              : "Show screenshots"
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
                  {scannedThumbnailsExpanded &&
                    selectedScreenshotPreviews.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-2.5">
                        {selectedScreenshotPreviews.map((preview, index) => (
                          <button
                            key={`${preview.name}-scanned-preview-${index}`}
                            type="button"
                            className="min-w-0 overflow-hidden rounded-2xl border bg-background text-left shadow-sm active:scale-[0.99]"
                            onClick={() => setActiveCropIndex(index)}
                            title={preview.name}
                          >
                            <div className="aspect-[9/16] bg-slate-100">
                              <img
                                src={preview.url}
                                alt={preview.name}
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="truncate px-2 py-1.5 text-[9px] font-bold text-muted-foreground">
                              {index + 1}. {preview.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
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
                    {ocrInputSource === "voiceText"
                      ? "List Summary"
                      : "Scan Summary"}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {hasExpectedAttendeeNumber && (
                      <div
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${missingFromScan > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                      >
                        {scannedNameCount} / {Math.round(expectedAttendeeNumber)}
                      </div>
                    )}
                    {ocrInputSource === "screenshot" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={exportOcrReport}
                        className="h-7 rounded-xl px-2 text-[10px] font-black"
                      >
                        Export report
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
                  <span className="rounded-full bg-muted/60 px-2 py-1 text-foreground">
                    {ocrInputSource === "voiceText" ? "Parsed" : "Found"}:{" "}
                    {scannedNameCount}
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
                      <span
                        key={ocrCandidateKey(candidate)}
                        className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-800 ring-1 ring-sky-100"
                      >
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
                  {reviewNames.length > 0 && (
                    <div className="text-[10px] font-black text-muted-foreground">
                      {safeMatches} match · {suggestions} check · {newNames} new
                    </div>
                  )}
                </div>
                {ocrInputSource === "screenshot" && (
                  <div className="mb-2 rounded-lg border bg-muted/30 px-2 py-1.5 text-[10px] font-bold text-muted-foreground">
                    OCR debug: {ocrRawWordCount} raw words · {ocrRawLineCount}{" "}
                    raw lines · {reviewNames.length} review names
                  </div>
                )}
                {reviewNames.length > 0 ? (
                  <div className="space-y-2 pr-1">
                    {reviewNames.map((candidate, index) => {
                      const candidateKey = ocrCandidateKey(candidate);
                      const isSelectedMatch =
                        selectedOcrCandidateKeySet.has(candidateKey);
                      const resolvedMatch = resolveOcrMatch(candidate);
                      const reviewStatus = getOcrReviewStatus(candidate);
                      const canEditNewName =
                        reviewStatus === "new" && !resolvedMatch;
                      const cleanedEditedName =
                        getEditedOcrCandidateName(candidate);
                      const editedName =
                        editedOcrCandidateNames[candidateKey] ??
                        cleanedEditedName;
                      const nameTokens = getOcrNameTokens(candidate);
                      const tokenSelection = getOcrTokenSelection(candidate);
                      const canUseTokenEditor =
                        canEditNewName && nameTokens.length > 1;
                      const displayCandidateName = canEditNewName
                        ? cleanedEditedName || candidate.name
                        : candidate.name;

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
                                  {displayCandidateName}
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
                          {canEditNewName && (
                            <div className="mt-2 rounded-xl border border-sky-100 bg-white/80 p-2">
                              {canUseTokenEditor && (
                                <>
                                  <div className="mb-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                                    Tap wrong words off
                                  </div>
                                  <div className="mb-2 flex flex-wrap gap-1">
                                    {nameTokens.map((token, tokenIndex) => {
                                      const isKept = tokenSelection[tokenIndex];
                                      return (
                                        <button
                                          key={`${candidateKey}-${token}-${tokenIndex}`}
                                          type="button"
                                          onClick={() =>
                                            toggleOcrCandidateToken(
                                              candidate,
                                              tokenIndex,
                                            )
                                          }
                                          className={`rounded-full border px-2 py-0.5 text-[10px] font-black transition ${
                                            isKept
                                              ? "border-sky-200 bg-sky-50 text-sky-900"
                                              : "border-slate-200 bg-slate-100 text-slate-400 line-through"
                                          }`}
                                          aria-pressed={isKept}
                                        >
                                          {token}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                              <label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-sky-700">
                                Will add
                              </label>
                              <Input
                                value={editedName}
                                onChange={(event) =>
                                  updateEditedOcrCandidateName(
                                    candidate,
                                    event.target.value,
                                  )
                                }
                                onBlur={() =>
                                  updateEditedOcrCandidateName(
                                    candidate,
                                    cleanedEditedName,
                                  )
                                }
                                className="h-8 rounded-xl border-sky-100 bg-white text-xs font-black text-slate-900"
                                placeholder="Clean player name"
                              />
                              {cleanedEditedName !== candidate.name && (
                                <div className="mt-1 text-[10px] font-medium text-sky-700">
                                  Scan text: {candidate.name}
                                </div>
                              )}
                            </div>
                          )}
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
                                    onClick={() =>
                                      chooseOcrCandidateAsNew(candidate)
                                    }
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                      chosenOcrMatchIds[candidateKey] ===
                                      "__new__"
                                        ? "bg-sky-100 text-sky-900 border-sky-300"
                                        : "bg-card text-muted-foreground"
                                    }`}
                                  >
                                    {chosenOcrMatchIds[candidateKey] ===
                                    "__new__"
                                      ? "✓ "
                                      : "Add as new: "}
                                    {displayCandidateName}
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-foreground">
                      Check missed names
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Use Add to rescue names the scanner missed.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRawOcrText((value) => !value)}
                    className="h-8 shrink-0 px-3 text-[10px] font-black"
                  >
                    {showRawOcrText ? "Hide words" : "Show words"}
                  </Button>
                </div>
                {showRawOcrText && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      Possible missed names appear first. Already reviewed names are marked as In Review.
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        value={manualRawOcrName}
                        onChange={(event) =>
                          setManualRawOcrName(event.target.value)
                        }
                        placeholder="Type missing name from raw text"
                        autoCapitalize="words"
                        autoCorrect="off"
                        spellCheck={false}
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
                        const suggestedNormalized = normalizeForMatch(
                          entry.suggestedName || entry.text,
                        );
                        const alreadyAdded = rawOcrAddedNames.includes(
                          suggestedNormalized,
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
                                  const reviewStatus = getOcrReviewStatus(candidate);
                                  return (
                                    <span
                                      key={ocrCandidateKey(candidate)}
                                      className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${
                                        reviewStatus === "match"
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                          : reviewStatus === "suggest"
                                            ? "border-amber-200 bg-amber-50 text-amber-800"
                                            : "border-sky-200 bg-sky-50 text-sky-800"
                                      }`}
                                    >
                                      In Review: {candidate.name}
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
                <div className="w-full space-y-2">
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <div>
                      <label
                        htmlFor="expected-player-count"
                        className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground"
                      >
                        Expected players
                        <span className="font-bold normal-case tracking-normal text-muted-foreground/80">
                          {" "}
                          (optional)
                        </span>
                      </label>
                      <Input
                        id="expected-player-count"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={expectedAttendeeCount}
                        onChange={(event) =>
                          setExpectedAttendeeCount(event.target.value)
                        }
                        placeholder="Example: 20"
                        className="h-10 rounded-xl text-sm font-bold"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={runOcr}
                      disabled={selectedScreenshots.length === 0 || ocrRunning}
                      className="h-10 rounded-xl px-4 text-xs font-black"
                    >
                      {ocrRunning
                        ? "Scanning…"
                        : screenshotImportMode === "other"
                          ? "Scan Crops"
                          : "Scan Screenshot"}
                    </Button>
                  </div>
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
                      {ocrRunning
                        ? "Scanning…"
                        : screenshotImportMode === "other"
                          ? "Scan Crops"
                          : "Screenshot Import"}
                    </Button>
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground">
                    This footer stays fixed while you review uploaded
                    screenshots.
                  </div>
                </div>
              )
            ) : (
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={selectAllOcrMatches}
                  disabled={allOcrTotal === 0}
                  className="h-9 shrink-0 rounded-xl px-3 text-xs font-black whitespace-nowrap"
                >
                  {allSelectableOcrSelected
                    ? `Clear All (${allOcrTotal})`
                    : `Select All (${allOcrTotal})`}
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
        open={Boolean(newPlayerReviewPrompt)}
        onOpenChange={(next) => {
          if (!next) setNewPlayerReviewPrompt(null);
        }}
      >
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Review new players?
            </DialogTitle>
            <DialogDescription className="text-xs">
              {newPlayerReviewPrompt?.count ?? 0} new player
              {newPlayerReviewPrompt?.count === 1 ? "" : "s"} were created with
              default Skill Level 5. You can quickly adjust skill and traits
              now.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] font-semibold leading-snug text-sky-800">
            This opens the Roster tab and starts with the first new player
            profile.
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewPlayerReviewPrompt(null)}
              className="h-9 text-xs font-bold"
            >
              Later
            </Button>
            <Button
              type="button"
              onClick={() => {
                const ids = newPlayerReviewPrompt?.playerIds ?? [];
                setNewPlayerReviewPrompt(null);
                if (ids.length > 0) onReviewNewPlayers?.(ids);
              }}
              className="h-9 text-xs font-black"
            >
              Review now
            </Button>
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
              const finalName =
                getEditedOcrCandidateName(candidate) || candidate.name;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-black text-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{finalName}</span>
                  <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                    Skill 5
                  </span>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl bg-sky-50 p-3 text-[11px] font-medium text-sky-800 border border-sky-100">
            New players will start with Skill Level 5 and the NEW badge. You can
            review skill and player type next in the Roster tab.
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
            <DialogTitle className="text-base font-black">
              Say or Paste Names
            </DialogTitle>
            <DialogDescription className="text-xs">
              Say, paste, or type names. The text box is the control center.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-2">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border bg-card p-3">
              <div>
                <label
                  htmlFor="voice-expected-attendee-count"
                  className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground"
                >
                  Expected
                  <span className="font-bold normal-case tracking-normal text-muted-foreground/80">
                    {" "}
                    (optional)
                  </span>
                </label>
                <Input
                  id="voice-expected-attendee-count"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={voiceExpectedAttendeeCount}
                  onChange={(event) =>
                    setVoiceExpectedAttendeeCount(event.target.value)
                  }
                  placeholder="Example: 18"
                  className="h-10 rounded-xl text-sm font-bold"
                />
              </div>
              <div
                className={`rounded-xl px-3 py-2 text-center text-[11px] font-black ${hasVoiceExpectedAttendeeNumber && voiceMissingCount > 0 ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-muted text-foreground"}`}
              >
                <div>
                  {voiceCapturedCount}
                  {hasVoiceExpectedAttendeeNumber
                    ? ` / ${Math.round(voiceExpectedAttendeeNumber)}`
                    : ""}
                </div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  names
                </div>
              </div>
            </div>

            <Textarea
              value={voiceText}
              onChange={(event) => setVoiceText(event.target.value)}
              onBlur={() =>
                setVoiceText((current) =>
                  formatVoiceNameList(
                    splitVoiceTextIntoNameLines(current, players),
                  ),
                )
              }
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
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Smart match review
                  </div>
                </div>
                {reviewNames.length > 0 && (
                  <div className="shrink-0 text-[10px] font-black text-muted-foreground">
                    {safeMatches} match · {suggestions} check · {newNames} new
                  </div>
                )}
              </div>

              {reviewNames.length > 0 ? (
                <div className="space-y-2">
                  {reviewNames.map((candidate, index) => {
                    const candidateKey = ocrCandidateKey(candidate);
                    const isSelectedMatch =
                      selectedOcrCandidateKeySet.has(candidateKey);
                    const resolvedMatch = resolveOcrMatch(candidate);
                    const reviewStatus = getOcrReviewStatus(candidate);
                    return (
                      <div
                        key={`${candidate.name}-${index}`}
                        className={`rounded-lg p-2.5 text-[11px] ${isSelectedMatch ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50"}`}
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
                              {reviewStatus === "suggest" && resolvedMatch && (
                                <div className="mt-0.5 font-medium text-amber-700">
                                  SELECTED: {displayName(resolvedMatch)} ·{" "}
                                  {candidate.score}%
                                </div>
                              )}
                              {reviewStatus === "new" && (
                                <div className="mt-0.5 font-medium text-sky-700">
                                  NEW: Will create roster player if selected
                                </div>
                              )}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${reviewStatus === "match" ? "bg-emerald-100 text-emerald-800" : reviewStatus === "suggest" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}
                          >
                            {reviewStatus === "match"
                              ? "MATCH"
                              : reviewStatus === "suggest"
                                ? "CHECK"
                                : "NEW"}
                          </span>
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
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isChosen ? "border-amber-300 bg-amber-100 text-amber-900" : "bg-card text-muted-foreground"}`}
                                    >
                                      {isChosen ? "✓ " : "+ "}
                                      {displayName(player)} {score}%
                                    </button>
                                  );
                                })}
                              {candidate.status === "suggest" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    chooseOcrCandidateAsNew(candidate)
                                  }
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${chosenOcrMatchIds[candidateKey] === "__new__" ? "border-sky-300 bg-sky-100 text-sky-900" : "bg-card text-muted-foreground"}`}
                                >
                                  {chosenOcrMatchIds[candidateKey] === "__new__"
                                    ? "✓ "
                                    : "+ New: "}
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
                  Names typed above will appear here.
                </div>
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
                <Mic
                  className={`mr-1.5 h-3.5 w-3.5 ${voiceListening ? "animate-pulse" : ""}`}
                />
                {voiceListening ? "RECORDING — TAP TO STOP" : "Record"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopVoiceListening();
                  setVoiceText("");
                  setVoiceStatus("");
                  setVoiceInterimText("");
                }}
                disabled={!voiceText.trim() && !voiceListening}
                className="h-10 rounded-xl px-3 text-xs font-bold"
              >
                Clear
              </Button>
              <Button
                type="button"
                onClick={importSelectedVoiceNames}
                disabled={!voiceText.trim() || selectedOcrTotal === 0}
                className="h-10 min-w-0 flex-1 rounded-xl px-3 text-xs font-black"
              >
                Import Names ({selectedOcrTotal})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {todayRosterReady && (
        <>
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
                className={`flex min-h-[46px] items-center gap-2 px-2.5 py-2.5 border rounded-xl cursor-pointer transition-all ${player.attending ? "border-primary/35 bg-primary/[0.035] shadow-[0_1px_4px_rgba(15,23,42,0.05)]" : "border-border/80 bg-card"}`}
                data-testid={`attendance-row-${player.id}`}
              >
                <Checkbox
                  checked={!!player.attending}
                  onCheckedChange={() => togglePlayer(player)}
                  className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-none shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white"
                  data-testid={`attendance-check-${player.id}`}
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex w-full max-w-full items-center gap-1">
                    <span
                      className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[13px] leading-tight ${player.attending ? "text-[#102A43]" : "text-foreground"}`}
                      title={displayName(player)}
                    >
                      {displayName(player)}
                    </span>
                    <TodayStatusDots player={player} />
                  </div>
                </div>
                {player.attending && (
                  <button
                    type="button"
                    aria-label={
                      isNotHereYet(player)
                        ? "Mark player as arrived"
                        : "Mark player as not here yet"
                    }
                    title={isNotHereYet(player) ? "Mark arrived" : "Not here yet"}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleNotHereYet(player);
                    }}
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isNotHereYet(player)
                        ? "border-amber-300 bg-amber-100 text-amber-800"
                        : "border-slate-200 bg-white/80 text-slate-500"
                    }`}
                    data-testid={`today-status-${player.id}`}
                  >
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </label>
            ))}
          </div>
        )}
        </>
      )}
    </div>
  );
}

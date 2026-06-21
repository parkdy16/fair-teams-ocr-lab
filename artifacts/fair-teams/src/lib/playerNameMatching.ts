export type PlayerNameLike = {
  id?: string | null;
  name?: string | null;
  aka?: string | null;
};

export type PlayerNameMatch<T extends PlayerNameLike> = {
  player: T;
  candidate: string;
  score: number;
  secondBestScore: number;
};

export function normalizePlayerNameForMatch(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactPlayerNameKey(value: string | null | undefined) {
  return normalizePlayerNameForMatch(value).replace(/\s+/g, "");
}

export function splitPlayerAliasValues(value?: string | null) {
  return String(value || "")
    .split(/[,/;|·•]+|\baka\b|\bnickname\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
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

export function displayNameFromSpokenInput(value: string | null | undefined) {
  return normalizePlayerNameForMatch(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseNameWord)
    .join(" ");
}

function addCandidate(candidates: Set<string>, value: string | null | undefined) {
  const normalized = normalizePlayerNameForMatch(value);
  if (normalized && normalized.length >= 2) candidates.add(normalized);
}

export function candidateNamesForRosterPlayer(player: PlayerNameLike, options?: { includeDisplayName?: boolean }) {
  const candidates = new Set<string>();
  const rawName = String(player.name || "").trim();
  const aliases = splitPlayerAliasValues(player.aka);

  addCandidate(candidates, rawName);
  aliases.forEach((alias) => addCandidate(candidates, alias));

  if (options?.includeDisplayName && rawName && player.aka?.trim()) {
    addCandidate(candidates, `${rawName} (${player.aka})`);
  }

  aliases.forEach((alias) => {
    if (!rawName || !alias) return;
    addCandidate(candidates, `${rawName} ${alias}`);
    addCandidate(candidates, `${alias} ${rawName}`);
  });

  [...candidates].forEach((candidate) => {
    const parts = candidate.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      addCandidate(candidates, `${parts[0]} ${parts[parts.length - 1]}`);
      addCandidate(candidates, `${parts[0]} ${parts[parts.length - 1][0]}`);
    }
    if (parts[0] && parts[0].length >= 3) addCandidate(candidates, parts[0]);
  });

  return [...candidates];
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

export function nameSimilarityScore(a: string, b: string) {
  const left = normalizePlayerNameForMatch(a);
  const right = normalizePlayerNameForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  const maxLength = Math.max(left.length, right.length);
  return Math.round((1 - levenshteinDistance(left, right) / maxLength) * 100);
}

export function voiceNameAlternates(name: string | null | undefined) {
  const normalized = normalizePlayerNameForMatch(name);
  const alternatesByName: Record<string, string[]> = {
    george: ["Jorge"],
    jorge: ["George"],
    june: ["Joon", "Jun"],
    jun: ["Joon", "June"],
    joon: ["June", "Jun"],
    yan: ["Jan"],
    jan: ["Yan", "Yann", "Jaan"],
    yann: ["Jan"],
    jaan: ["Jan"],
    andrew: ["Andrea"],
    andrea: ["Andrew"],
    anya: ["Tanja", "Tanya", "Anja"],
    anja: ["Tanja", "Tanya", "Anya"],
    tanja: ["Tanya", "Anya", "Anja"],
    tanya: ["Tanja", "Anya", "Anja"],
    tania: ["Tanja", "Tanya", "Anya"],
    brioche: ["Brijesh"],
    brioch: ["Brijesh"],
    briesh: ["Brijesh"],
    brish: ["Brijesh"],
    briish: ["Brijesh"],
    rish: ["Brijesh"],
    brijes: ["Brijesh"],
    brijesh: ["Briesh", "Brioche", "Rish", "Brish"],
    philip: ["Phillip", "Filip", "Fillip"],
    phillip: ["Philip", "Filip", "Fillip"],
    filip: ["Philip", "Phillip", "Fillip"],
    fillip: ["Philip", "Phillip", "Filip"],
    rafael: ["Raphael"],
    raphael: ["Rafael"],
  };

  return alternatesByName[normalized] ?? [];
}

export function voiceNameSoundKey(value: string | null | undefined) {
  let key = compactPlayerNameKey(value);
  if (!key) return "";

  key = key
    .replace(/george/g, "jorj")
    .replace(/jorge/g, "jorj")
    .replace(/^jun$/g, "joon")
    .replace(/^june$/g, "joon")
    .replace(/^anya/g, "tanja")
    .replace(/^anja/g, "tanja")
    .replace(/^tanya/g, "tanja")
    .replace(/^tania/g, "tanja")
    .replace(/brijesh/g, "briesh")
    .replace(/brijes/g, "briesh")
    .replace(/^rish/g, "briesh")
    .replace(/^brish/g, "briesh")
    .replace(/^briish/g, "briesh")
    .replace(/brioche/g, "briesh")
    .replace(/brioch/g, "briesh")
    .replace(/briesh/g, "briesh")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/x/g, "ks")
    .replace(/ij/g, "i")
    .replace(/ije/g, "ie")
    .replace(/y/g, "i")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/ue/g, "u")
    .replace(/^geor/g, "jor")
    .replace(/^geo/g, "jo")
    .replace(/z/g, "s")
    .replace(/sh$/g, "s")
    .replace(/e$/g, "");

  if (key.length <= 2) return key;
  const first = key[0];
  const rest = key
    .slice(1)
    .replace(/[aeiou]+/g, "")
    .replace(/(.)\1+/g, "$1");
  return `${first}${rest}`;
}

export function speechSoundSimilarityScore(a: string, b: string) {
  const aKey = voiceNameSoundKey(a);
  const bKey = voiceNameSoundKey(b);
  if (!aKey || !bKey) return 0;
  if (aKey === bKey) return 92;
  const maxLength = Math.max(aKey.length, bKey.length);
  const score = Math.round((1 - levenshteinDistance(aKey, bKey) / maxLength) * 100);
  return score >= 80 ? Math.min(90, score) : 0;
}

function tokenWords(value: string) {
  return normalizePlayerNameForMatch(value).split(/\s+/).filter(Boolean);
}

function scoreCandidateName(inputName: string, candidate: string) {
  const input = normalizePlayerNameForMatch(inputName);
  const normalizedCandidate = normalizePlayerNameForMatch(candidate);
  if (!input || !normalizedCandidate) return 0;
  if (input === normalizedCandidate) return 100;

  const inputWords = tokenWords(input);
  const candidateWords = tokenWords(normalizedCandidate);
  const inputFirstName = inputWords[0] ?? "";
  const candidateFirstName = candidateWords[0] ?? "";

  if (candidateWords.length === 1 && candidateFirstName.length >= 3 && inputWords.includes(candidateFirstName)) {
    return candidateFirstName.length >= 4 ? 96 : 93;
  }

  if (candidateWords.length === 1 && candidateFirstName.length >= 4) {
    const bestTokenScore = Math.max(
      0,
      ...inputWords
        .filter((word) => word.length >= 3)
        .map((word) => nameSimilarityScore(word, candidateFirstName)),
    );
    if (bestTokenScore === 100) return 96;
    if (bestTokenScore >= 90) return 94;
    if (bestTokenScore >= 84) return 88;
  }

  if (inputFirstName && inputFirstName === candidateFirstName) {
    return candidateWords.length === 1 ? 96 : 94;
  }

  const alternateScore = Math.max(
    0,
    ...voiceNameAlternates(input).map((alternate) => nameSimilarityScore(alternate, normalizedCandidate)),
    ...voiceNameAlternates(normalizedCandidate).map((alternate) => nameSimilarityScore(input, alternate)),
  );
  if (alternateScore >= 95) return 94;

  const speechScore = speechSoundSimilarityScore(input, normalizedCandidate);
  const firstWordSpeechScore = speechSoundSimilarityScore(inputFirstName, candidateFirstName);
  if (speechScore >= 88 || firstWordSpeechScore >= 88) {
    return Math.max(speechScore, firstWordSpeechScore, 86);
  }

  const inputSoundKey = voiceNameSoundKey(inputFirstName || input);
  const candidateSoundKey = voiceNameSoundKey(candidateFirstName || normalizedCandidate);
  // Android voice often drops the first syllable or consonant of unfamiliar names:
  // “Tanja” → “Anya”, “Brijesh” → “Rish”. Treat this as a possible match only
  // when the remaining sound key is long enough to be useful.
  if (inputSoundKey.length >= 3 && candidateSoundKey.length >= 4) {
    if (candidateSoundKey.endsWith(inputSoundKey) || inputSoundKey.endsWith(candidateSoundKey)) {
      return 86;
    }
  }

  const rawScore = nameSimilarityScore(input, normalizedCandidate);
  const firstWordScore = nameSimilarityScore(inputFirstName, candidateFirstName);

  // Keep loose fuzzy matching conservative unless the spoken/saved names begin similarly.
  if (normalizedCandidate[0] !== input[0]) return rawScore >= 92 && firstWordScore >= 92 ? rawScore : 0;
  if (firstWordScore < 70) return 0;
  return Math.max(rawScore, speechScore);
}

export function scorePlayerNameMatch<T extends PlayerNameLike>(inputName: string, player: T, options?: { includeDisplayName?: boolean }) {
  const candidates = candidateNamesForRosterPlayer(player, options);
  if (candidates.length === 0) return 0;
  return Math.max(0, ...candidates.map((candidate) => scoreCandidateName(inputName, candidate)));
}

export function bestPlayerNameMatch<T extends PlayerNameLike>(inputName: string, players: T[], options?: { includeDisplayName?: boolean }): PlayerNameMatch<T> | null {
  const rows = players.flatMap((player) =>
    candidateNamesForRosterPlayer(player, options).map((candidate) => ({
      player,
      candidate,
      score: scoreCandidateName(inputName, candidate),
    })),
  );

  let best: { player: T; candidate: string; score: number } | null = null;
  let secondBestScore = 0;
  rows.forEach((row) => {
    if (row.score > (best?.score || 0)) {
      secondBestScore = best?.score || 0;
      best = row;
    } else if (row.score > secondBestScore) {
      secondBestScore = row.score;
    }
  });

  return best ? { ...best, secondBestScore } : null;
}

export function likelySamePlayerName(inputName: string, rosterName: string) {
  return scoreCandidateName(inputName, rosterName) >= 86;
}

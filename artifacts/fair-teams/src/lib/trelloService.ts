export type TrelloBoard = {
  id: string;
  name: string;
  url: string;
  closed?: boolean;
};

export type TrelloBoardSummary = TrelloBoard & {
  openListCount: number;
  openCardCount: number;
};

const TRELLO_API_KEY = String(import.meta.env.VITE_TRELLO_API_KEY || "").trim();
const TOKEN_PREFIX = "fairteams.trello.token.v1.";
const PENDING_USER_KEY = "fairteams.trello.pendingUser.v1";

function safeUserKey(userKey: string) {
  return userKey.trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, "-");
}

function tokenStorageKey(userKey: string) {
  return `${TOKEN_PREFIX}${safeUserKey(userKey)}`;
}

export function trelloIsConfigured() {
  return Boolean(TRELLO_API_KEY);
}

export function getStoredTrelloToken(userKey: string) {
  if (typeof window === "undefined" || !userKey.trim()) return "";
  return window.localStorage.getItem(tokenStorageKey(userKey)) || "";
}

export function clearStoredTrelloToken(userKey: string) {
  if (typeof window === "undefined" || !userKey.trim()) return;
  window.localStorage.removeItem(tokenStorageKey(userKey));
}

export function captureTrelloAuthorization(userKey: string): { connected: boolean; error?: string } | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  if (!params.has("token") && !params.has("error")) return null;

  const pendingUser = window.sessionStorage.getItem(PENDING_USER_KEY) || userKey;
  const token = params.get("token") || "";
  const error = params.get("error") || "";
  window.sessionStorage.removeItem(PENDING_USER_KEY);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  if (token && pendingUser) {
    window.localStorage.setItem(tokenStorageKey(pendingUser), token);
    return { connected: true };
  }
  return { connected: false, error: error || "Trello authorization was not completed." };
}

export function startTrelloAuthorization(userKey: string) {
  if (typeof window === "undefined") return;
  if (!TRELLO_API_KEY) throw new Error("Trello API key is not configured.");
  if (!userKey.trim()) throw new Error("Sign in to Fair Teams first.");

  window.sessionStorage.setItem(PENDING_USER_KEY, userKey);
  const returnUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({
    expiration: "never",
    scope: "read",
    response_type: "token",
    callback_method: "fragment",
    return_url: returnUrl,
    key: TRELLO_API_KEY,
  });
  window.location.assign(`https://trello.com/1/authorize?${params.toString()}`);
}

async function trelloFetch<T>(path: string, token: string): Promise<T> {
  if (!TRELLO_API_KEY) throw new Error("Trello API key is not configured.");
  if (!token) throw new Error("Connect your Trello account first.");
  const response = await fetch(`https://api.trello.com/1${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth oauth_consumer_key="${TRELLO_API_KEY}", oauth_token="${token}"`,
    },
  });
  if (response.status === 401) throw new Error("Trello connection expired or was revoked. Connect again.");
  if (!response.ok) throw new Error(`Trello request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function listTrelloBoards(token: string): Promise<TrelloBoard[]> {
  const rows = await trelloFetch<Array<Record<string, unknown>>>("/members/me/boards?fields=id,name,url,closed&filter=open", token);
  return rows
    .map((row) => ({ id: String(row.id || ""), name: String(row.name || "Untitled board"), url: String(row.url || ""), closed: Boolean(row.closed) }))
    .filter((board) => board.id && board.url && !board.closed)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTrelloBoardSummary(boardId: string, token: string): Promise<TrelloBoardSummary> {
  const [board, lists, cards] = await Promise.all([
    trelloFetch<Record<string, unknown>>(`/boards/${encodeURIComponent(boardId)}?fields=id,name,url,closed`, token),
    trelloFetch<Array<Record<string, unknown>>>(`/boards/${encodeURIComponent(boardId)}/lists?filter=open&fields=id,name,closed`, token),
    trelloFetch<Array<Record<string, unknown>>>(`/boards/${encodeURIComponent(boardId)}/cards?fields=id,name,closed`, token),
  ]);
  return {
    id: String(board.id || boardId),
    name: String(board.name || "Trello board"),
    url: String(board.url || ""),
    closed: Boolean(board.closed),
    openListCount: lists.filter((item) => !item.closed).length,
    openCardCount: cards.filter((item) => !item.closed).length,
  };
}

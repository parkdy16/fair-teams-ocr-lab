import assert from "node:assert/strict";
import test from "node:test";
import {
  createRoster,
  loadRosterState,
  normalizePlayer,
  saveRosterState,
} from "./localRoster.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function withMemoryStorage(run: (storage: MemoryStorage) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    run(storage);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

function representativeRoster() {
  const roster = createRoster("Regression roster", [{
    id: "player-a",
    name: "Alex Example",
    aka: "Lex",
    gender: "other",
    skill: 7,
    attack: 8,
    defense: 6,
    speed: 7.5,
    passing: 7,
    stamina: 6.5,
    physical: 7,
    teamPlay: 3,
    isGoalkeeper: true,
    todayStatus: "not_here_yet",
    attending: true,
    createdAt: "2026-08-19T09:00:00.000Z",
  }]);
  roster.pairingRules = [{
    id: "pair-a",
    kind: "together",
    playerAId: "player-a",
    playerBId: "player-b",
  }];
  roster.players.push(normalizePlayer({
    id: "player-b",
    name: "Blair Example",
    skill: 5,
    attending: false,
    createdAt: "2026-08-19T09:00:00.000Z",
  }, 1));
  return roster;
}

test("local roster roundtrip retains representative player and pairing fields", () => {
  withMemoryStorage(() => {
    const roster = representativeRoster();
    saveRosterState({ rosters: [roster], activeRosterId: roster.id });
    const loaded = loadRosterState();
    assert.equal(loaded.activeRosterId, roster.id);
    assert.equal(loaded.rosters[0]?.name, "Regression roster");
    assert.equal(loaded.rosters[0]?.players[0]?.aka, "Lex");
    assert.equal(loaded.rosters[0]?.players[0]?.gender, "other");
    assert.equal(loaded.rosters[0]?.players[0]?.isGoalkeeper, true);
    assert.equal(loaded.rosters[0]?.players[0]?.teamPlay, 3);
    assert.equal(loaded.rosters[0]?.pairingRules[0]?.kind, "together");
  });
});

test("a persisted player edit survives a second local roster load", () => {
  withMemoryStorage(() => {
    const roster = representativeRoster();
    saveRosterState({ rosters: [roster], activeRosterId: roster.id });
    const firstLoad = loadRosterState();
    firstLoad.rosters[0]!.players[0] = {
      ...firstLoad.rosters[0]!.players[0]!,
      name: "Alex Updated",
      defense: 8.5,
    };
    saveRosterState(firstLoad);
    const secondLoad = loadRosterState();
    assert.equal(secondLoad.rosters[0]?.players[0]?.name, "Alex Updated");
    assert.equal(secondLoad.rosters[0]?.players[0]?.defense, 8.5);
  });
});

test("Today not-here-yet survives normalization while obsolete late is not a valid state", () => {
  const supported = normalizePlayer({ name: "Supported", todayStatus: "not_here_yet" });
  const obsolete = normalizePlayer({ name: "Obsolete", todayStatus: "late" as never });
  assert.equal(supported.todayStatus, "not_here_yet");
  assert.equal(obsolete.todayStatus, "here");
  assert.notEqual(obsolete.todayStatus as string, "late");
});

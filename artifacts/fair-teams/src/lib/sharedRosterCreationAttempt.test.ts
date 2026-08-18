import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptSharedRosterCreationResult,
  bindSharedRosterCreationAttemptToGroup,
  getOrCreateSharedRosterCreationAttempt,
  preserveCreatedRosterWhenRatingSeedFails,
  recordSharedRosterCreationResult,
} from "./sharedRosterCreationAttempt.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("one pending local publication attempt survives retry until its result is adopted", () => {
  const storage = new MemoryStorage();
  const first = getOrCreateSharedRosterCreationAttempt("organizer-a", "local-roster", storage);
  const afterReload = getOrCreateSharedRosterCreationAttempt("organizer-a", "local-roster", storage);
  assert.equal(afterReload.creationRequestId, first.creationRequestId);

  const bound = bindSharedRosterCreationAttemptToGroup(first, "group-a", storage);
  assert.equal(bound.groupId, "group-a");
  const recorded = recordSharedRosterCreationResult(bound, "shared-roster-a", storage);
  assert.equal(recorded.resultingRosterId, "shared-roster-a");

  assert.equal(
    adoptSharedRosterCreationResult("organizer-a", "local-roster", "wrong-roster", storage),
    false,
  );
  assert.equal(
    getOrCreateSharedRosterCreationAttempt("organizer-a", "local-roster", storage).creationRequestId,
    first.creationRequestId,
  );

  assert.equal(
    adoptSharedRosterCreationResult("organizer-a", "local-roster", "shared-roster-a", storage),
    true,
  );
  const deliberateNewAttempt = getOrCreateSharedRosterCreationAttempt(
    "organizer-a",
    "local-roster",
    storage,
  );
  assert.notEqual(deliberateNewAttempt.creationRequestId, first.creationRequestId);
});

test("competing group binds keep the first persisted group for one logical attempt", () => {
  const storage = new MemoryStorage();
  const attempt = getOrCreateSharedRosterCreationAttempt("organizer-a", "local-roster", storage);
  const first = bindSharedRosterCreationAttemptToGroup(attempt, "group-a", storage);
  const second = bindSharedRosterCreationAttemptToGroup(attempt, "group-b", storage);
  assert.equal(first.groupId, "group-a");
  assert.equal(second.groupId, "group-a");
  assert.equal(second.creationRequestId, first.creationRequestId);
});

test("post-create rating failure preserves the adopted creation result", async () => {
  const created = { id: "shared-roster-a", groupId: "group-a" };
  const result = await preserveCreatedRosterWhenRatingSeedFails(created, async () => {
    throw new Error("rating write failed");
  });
  assert.equal(result.id, "shared-roster-a");
  assert.equal(result.groupId, "group-a");
  assert.match(result.creationWarning || "", /Initial Club ratings could not be saved/);
});

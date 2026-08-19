import assert from "node:assert/strict";
import test from "node:test";
import { resolveDurableSchemaVersion } from "./durableSchema.ts";

const VERSIONED_CONTRACT = {
  currentVersion: 3,
  supportedVersions: [1, 3],
  unversionedVersion: null,
} as const;

test("resolves current and explicitly supported historical schema versions", () => {
  assert.deepEqual(resolveDurableSchemaVersion(3, VERSIONED_CONTRACT), {
    status: "supported",
    schemaVersion: 3,
    current: true,
  });
  assert.deepEqual(resolveDurableSchemaVersion(1, VERSIONED_CONTRACT), {
    status: "supported",
    schemaVersion: 1,
    current: false,
  });
});

test("requires an explicit policy for unversioned historical documents", () => {
  assert.deepEqual(resolveDurableSchemaVersion(undefined, VERSIONED_CONTRACT), {
    status: "unsupported",
    reason: "missing",
  });
  assert.deepEqual(resolveDurableSchemaVersion(undefined, {
    ...VERSIONED_CONTRACT,
    unversionedVersion: 1,
  }), {
    status: "supported",
    schemaVersion: 1,
    current: false,
  });
});

test("rejects malformed schema versions instead of coercing them", () => {
  for (const value of [null, "1", 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    assert.deepEqual(resolveDurableSchemaVersion(value, VERSIONED_CONTRACT), {
      status: "unsupported",
      reason: "invalid",
    });
  }
});

test("fails closed for future and retired schema versions", () => {
  for (const schemaVersion of [2, 4]) {
    assert.deepEqual(resolveDurableSchemaVersion(schemaVersion, VERSIONED_CONTRACT), {
      status: "unsupported",
      reason: "unsupported",
      schemaVersion,
    });
  }
});

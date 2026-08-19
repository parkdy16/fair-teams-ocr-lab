import assert from "node:assert/strict";
import test from "node:test";
import {
  MandatoryStageError,
  runMandatoryStage,
} from "./core-regression.mjs";

const silentLogger = { log() {} };

test("mandatory stage accepts a successful subprocess", () => {
  const result = runMandatoryStage({
    name: "successful child",
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    logger: silentLogger,
    stdio: "pipe",
  });
  assert.equal(result.name, "successful child");
});

test("mandatory stage propagates a failing subprocess exit code", () => {
  assert.throws(
    () => runMandatoryStage({
      name: "failing child",
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      logger: silentLogger,
      stdio: "pipe",
    }),
    (error) => {
      assert.ok(error instanceof MandatoryStageError);
      assert.equal(error.stageName, "failing child");
      assert.equal(error.exitCode, 7);
      return true;
    },
  );
});

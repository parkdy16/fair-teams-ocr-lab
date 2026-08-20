import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoreRegressionStages,
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

test("Core keeps the i18n UI-string policy immediately after architecture boundaries", () => {
  const stageNames = createCoreRegressionStages().map(({ name }) => name);
  const architectureIndex = stageNames.indexOf("Live architecture boundaries");
  const i18nIndex = stageNames.indexOf("I18n hard-coded UI-string policy");

  assert.notEqual(architectureIndex, -1);
  assert.equal(i18nIndex, architectureIndex + 1);
});

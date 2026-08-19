import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

const WINDOWS = process.platform === "win32";
const EMULATOR_ARTIFACT_NAMES = [
  "firebase-debug.log",
  "firestore-debug.log",
  "ui-debug.log",
];

export class MandatoryStageError extends Error {
  constructor(stageName, exitCode, cause) {
    super(`${stageName} failed with exit code ${exitCode}.`, { cause });
    this.name = "MandatoryStageError";
    this.stageName = stageName;
    this.exitCode = exitCode;
  }
}

function elapsedSeconds(startedAt) {
  return ((performance.now() - startedAt) / 1000).toFixed(2);
}

export function runMandatoryStage({
  name,
  command,
  args = [],
  cwd = REPOSITORY_ROOT,
  env = process.env,
  logger = console,
  shell = false,
  stdio = "inherit",
}) {
  const startedAt = performance.now();
  logger.log(`\n>>> ${name}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell,
    stdio,
  });
  if (result.error) {
    throw new MandatoryStageError(name, 1, result.error);
  }
  if (result.status !== 0) {
    throw new MandatoryStageError(name, result.status ?? 1);
  }
  const durationSeconds = elapsedSeconds(startedAt);
  logger.log(`<<< ${name} passed (${durationSeconds}s)`);
  return { name, durationSeconds: Number(durationSeconds) };
}

function discoverFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) return discoverFiles(absolutePath, predicate);
      return predicate(absolutePath) ? [absolutePath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function repositoryPath(absolutePath) {
  return relative(REPOSITORY_ROOT, absolutePath).replaceAll("\\", "/");
}

function cleanupEmulatorArtifacts() {
  for (const directory of [REPOSITORY_ROOT, join(REPOSITORY_ROOT, "functions")]) {
    for (const artifactName of EMULATOR_ARTIFACT_NAMES) {
      rmSync(join(directory, artifactName), { force: true });
    }
  }
}

function packageCommand(name) {
  return WINDOWS ? `${name}.cmd` : name;
}

function packageStage(name, command, args, cwd = REPOSITORY_ROOT) {
  if (WINDOWS) {
    return {
      name,
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", [packageCommand(command), ...args].join(" ")],
      cwd,
    };
  }
  return {
    name,
    command: packageCommand(command),
    args,
    cwd,
  };
}

export function createCoreRegressionStages() {
  const frontendTests = discoverFiles(join(REPOSITORY_ROOT, "src", "lib"), (file) =>
    file.endsWith(".test.ts") && !file.includes(`${join("src", "src")}\\`),
  ).map(repositoryPath);

  return [
    {
      name: "Core runner fail-closed self-test",
      command: process.execPath,
      args: ["--test", "scripts/core-regression-runner.test.mjs"],
    },
    {
      name: "Outer-source production logic and integration tests",
      command: process.execPath,
      args: ["--experimental-strip-types", "--test", ...frontendTests],
    },
    {
      name: "Functions syntax checks",
      command: process.execPath,
      args: ["scripts/check-functions-syntax.mjs"],
    },
    packageStage(
      "Functions and governance tests",
      "npm",
      ["test"],
      join(REPOSITORY_ROOT, "functions"),
    ),
    packageStage(
      "Firestore emulator core behavior",
      "npm",
      ["run", "test:rules:core"],
      join(REPOSITORY_ROOT, "functions"),
    ),
    packageStage(
      "Production frontend build",
      "pnpm",
      ["--filter", "@workspace/fair-teams", "run", "build"],
    ),
    {
      name: "Patch whitespace safety",
      command: "git",
      args: ["diff", "--check", "HEAD"],
    },
  ];
}

export function runCoreRegressionGate() {
  const gateStartedAt = performance.now();
  const stages = createCoreRegressionStages();
  const results = [];
  cleanupEmulatorArtifacts();
  console.log(`Stripes Core Regression Gate — ${stages.length} mandatory stages`);
  try {
    for (const stage of stages) {
      results.push(runMandatoryStage(stage));
    }
  } finally {
    cleanupEmulatorArtifacts();
  }
  console.log(`\nCORE REGRESSION GATE PASSED (${elapsedSeconds(gateStartedAt)}s)`);
  console.log("Informational only: the known nonzero full-project TypeScript baseline is documented but excluded.");
  return results;
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    runCoreRegressionGate();
  } catch (error) {
    const exitCode = error instanceof MandatoryStageError ? error.exitCode : 1;
    console.error(`\nCORE REGRESSION GATE FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = Number.isInteger(exitCode) && exitCode > 0 ? exitCode : 1;
  }
}

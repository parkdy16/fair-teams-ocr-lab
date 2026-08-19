import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const RECOVERY_PROJECT_ID = "demo-stripes-recovery-rehearsal";
const FUNCTIONS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIREBASE_CLI = join(
  FUNCTIONS_DIRECTORY,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js",
);
const PHASE_SCRIPT = join(FUNCTIONS_DIRECTORY, "recoveryRehearsalPhase.js");
const FIREBASE_CONFIG = "../firebase.json";
const TEMP_PREFIX = "stripes-recovery-";
const EMULATOR_ARTIFACT_NAMES = [
  "firebase-debug.log",
  "firestore-debug.log",
  "ui-debug.log",
];

const INHERITED_CLOUD_ENVIRONMENT_KEYS = [
  "CLOUDSDK_CORE_PROJECT",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_CONFIG",
  "FIREBASE_DATABASE_EMULATOR_HOST",
  "FIREBASE_EMULATOR_HUB",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FIREBASE_TOKEN",
  "FIRESTORE_EMULATOR_HOST",
  "GCLOUD_PROJECT",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
];

function assertDemoProjectId(projectId) {
  if (projectId !== RECOVERY_PROJECT_ID || !projectId.startsWith("demo-")) {
    throw new Error(`Recovery rehearsal refused unsafe project ID: ${projectId || "<empty>"}.`);
  }
}

function shellQuote(value) {
  if (process.platform === "win32") {
    if (value.includes('"')) throw new Error("Recovery phase path contains an unsupported quote.");
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function phaseCommand(mode) {
  if (mode !== "seed" && mode !== "verify") {
    throw new Error(`Unsupported recovery phase: ${mode}.`);
  }
  return `${shellQuote(process.execPath)} ${shellQuote(PHASE_SCRIPT)} ${mode}`;
}

function isolatedEnvironment(tempRoot) {
  const environment = { ...process.env };
  for (const key of INHERITED_CLOUD_ENVIRONMENT_KEYS) delete environment[key];

  const xdgConfigHome = join(tempRoot, "cli-config");
  const configStoreDirectory = join(xdgConfigHome, "configstore");
  mkdirSync(configStoreDirectory, { recursive: true });
  writeFileSync(
    join(configStoreDirectory, "firebase-tools.json"),
    JSON.stringify({ motd: { fetched: Date.now() } }),
    "utf8",
  );

  return {
    ...environment,
    CI: "true",
    FIREBASE_CLI_DISABLE_TELEMETRY: "1",
    NO_UPDATE_NOTIFIER: "1",
    STRIPES_RECOVERY_PROJECT_ID: RECOVERY_PROJECT_ID,
    XDG_CONFIG_HOME: xdgConfigHome,
  };
}

function runEmulatorPhase({ mode, exportDirectory, environment }) {
  const args = [
    FIREBASE_CLI,
    "emulators:exec",
    "--config",
    FIREBASE_CONFIG,
    "--only",
    "firestore",
    "--project",
    RECOVERY_PROJECT_ID,
  ];

  if (mode === "seed") {
    args.push("--export-on-exit", exportDirectory);
  } else {
    args.push("--import", exportDirectory);
  }
  args.push(phaseCommand(mode));

  console.log(`\n>>> Synthetic recovery ${mode} phase`);
  const result = spawnSync(process.execPath, args, {
    cwd: FUNCTIONS_DIRECTORY,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Synthetic recovery ${mode} phase failed with exit code ${result.status ?? 1}.`);
  }
  console.log(`<<< Synthetic recovery ${mode} phase passed`);
}

function assertFirestoreExport(exportDirectory) {
  const metadataPath = join(exportDirectory, "firebase-export-metadata.json");
  if (!existsSync(metadataPath)) {
    throw new Error("Firestore emulator export metadata was not created.");
  }

  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const relativeMetadataFile = metadata?.firestore?.metadata_file;
  if (typeof relativeMetadataFile !== "string" || !relativeMetadataFile.trim()) {
    throw new Error("Firestore emulator export metadata is incomplete.");
  }

  const resolvedExport = resolve(exportDirectory);
  const resolvedFirestoreMetadata = resolve(exportDirectory, relativeMetadataFile);
  const relativePath = relative(resolvedExport, resolvedFirestoreMetadata);
  if (
    isAbsolute(relativePath)
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || !existsSync(resolvedFirestoreMetadata)
  ) {
    throw new Error("Firestore emulator export points outside its dedicated directory or is missing.");
  }
}

function removeDedicatedTempDirectory(tempRoot, systemTempRoot) {
  const resolvedTempRoot = resolve(tempRoot);
  const resolvedSystemTemp = resolve(systemTempRoot);
  const expectedPrefix = `${resolvedSystemTemp}${sep}`;
  if (
    !resolvedTempRoot.startsWith(expectedPrefix)
    || !basename(resolvedTempRoot).startsWith(TEMP_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected recovery directory: ${resolvedTempRoot}.`);
  }
  rmSync(resolvedTempRoot, { recursive: true, force: true });
}

function cleanupEmulatorArtifacts() {
  for (const artifactName of EMULATOR_ARTIFACT_NAMES) {
    rmSync(join(FUNCTIONS_DIRECTORY, artifactName), { force: true });
  }
}

function runRecoveryRehearsal() {
  assertDemoProjectId(RECOVERY_PROJECT_ID);
  if (!existsSync(FIREBASE_CLI)) {
    throw new Error("Install the pinned Functions dependencies before running the recovery rehearsal.");
  }
  if (!existsSync(PHASE_SCRIPT)) {
    throw new Error("Synthetic recovery phase script is missing.");
  }

  const systemTempRoot = realpathSync(tmpdir());
  const tempRoot = mkdtempSync(join(systemTempRoot, TEMP_PREFIX));
  const exportDirectory = join(tempRoot, "export");

  cleanupEmulatorArtifacts();
  try {
    const environment = isolatedEnvironment(tempRoot);
    runEmulatorPhase({ mode: "seed", exportDirectory, environment });
    assertFirestoreExport(exportDirectory);
    runEmulatorPhase({ mode: "verify", exportDirectory, environment });
    console.log("\nSYNTHETIC FIRESTORE RECOVERY REHEARSAL PASSED");
  } finally {
    try {
      removeDedicatedTempDirectory(tempRoot, systemTempRoot);
    } finally {
      cleanupEmulatorArtifacts();
    }
  }
}

try {
  runRecoveryRehearsal();
} catch (error) {
  console.error(
    `\nSYNTHETIC FIRESTORE RECOVERY REHEARSAL FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

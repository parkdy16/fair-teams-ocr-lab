import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_RULES,
  formatArchitectureViolations,
  inspectArchitectureBoundaries,
} from "./check-architecture-boundaries.mjs";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const LIVE_REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "..");

const LIVE_ENTRY_HTML = `<!doctype html>
<html>
  <body>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

function inspectFixture(files) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "stripes-architecture-"));
  try {
    const fixtureFiles = {
      "index.html": LIVE_ENTRY_HTML,
      "src/main.tsx": 'import "./App";\n',
      "src/App.tsx": "export {};\n",
      ...files,
    };
    for (const [file, contents] of Object.entries(fixtureFiles)) {
      const destination = resolve(fixtureRoot, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, contents, "utf8");
    }
    return inspectArchitectureBoundaries({ repositoryRoot: fixtureRoot });
  } finally {
    const resolvedFixtureRoot = resolve(fixtureRoot);
    assert.equal(dirname(resolvedFixtureRoot), resolve(tmpdir()));
    assert.match(basename(resolvedFixtureRoot), /^stripes-architecture-/);
    rmSync(resolvedFixtureRoot, { recursive: true, force: true });
  }
}

function violationsFor(result, ruleId) {
  return result.violations.filter((violation) => violation.ruleId === ruleId);
}

function assertNoViolations(result) {
  assert.equal(
    result.violations.length,
    0,
    `Unexpected architecture violations:\n${formatArchitectureViolations(result)}`,
  );
}

test("allows only the existing Firebase client and seven Google UI import pairs", () => {
  const result = inspectFixture({
    "src/App.tsx": [
      'import "@/lib/googleDriveAuth";',
      'import "@/lib/googleDriveCabinetApi";',
      'import "@/lib/googleDriveFiles";',
      'import "@/lib/googleSheetsFiles";',
      'import "@/lib/googleDrivePicker";',
    ].join("\n"),
    "src/components/ClubTab.tsx": 'import { getFairTeamsAuth } from "@/lib/firebaseClient";\nvoid getFairTeamsAuth;\n',
    "src/components/SharedWorkspaceCabinetCard.tsx": [
      'import "@/lib/googleDriveCabinetApi";',
      'import "@/lib/googleDriveSharedCabinetApi";',
    ].join("\n"),
    "src/lib/firebaseClient.ts": "export function getFairTeamsAuth() {}\n",
    "src/lib/googleDriveAuth.ts": "export {};\n",
    "src/lib/googleDriveCabinetApi.ts": "export {};\n",
    "src/lib/googleDriveFiles.ts": "export {};\n",
    "src/lib/googleDrivePicker.ts": "export {};\n",
    "src/lib/googleDriveSharedCabinetApi.ts": "export {};\n",
    "src/lib/googleSheetsFiles.ts": "export {};\n",
  });

  assertNoViolations(result);
});

test("requires index.html to keep the live outer main entry", () => {
  const result = inspectFixture({
    "index.html": '<script type="module" src="./src/src/main.tsx"></script>\n',
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.entry).length, 2);
});

test("quarantines the stale src/src tree for every supported module reference", () => {
  const result = inspectFixture({
    "src/App.tsx": [
      'import "@/src/static";',
      'export * from "@/src/exported";',
      'void import("@/src/dynamic");',
      'require("@/src/required");',
    ].join("\n"),
    "src/src/static.ts": "export {};\n",
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.staleSource).length, 4);
});

test("rejects relative imports that escape the live src directory", () => {
  const result = inspectFixture({
    "src/App.tsx": 'import "../functions/index.js";\n',
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.relativeEscape).length, 1);
});

test("rejects src/lib imports of UI modules", () => {
  const result = inspectFixture({
    "src/components/Widget.tsx": "export const Widget = null;\n",
    "src/lib/domain.ts": 'import { Widget } from "@/components/Widget";\nvoid Widget;\n',
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.libToUi).length, 1);
});

test("rejects direct Firebase SDK imports from UI", () => {
  const result = inspectFixture({
    "src/App.tsx": [
      'import "firebase/app";',
      'void import("firebase/auth");',
      'import "firebase-admin/firestore";',
      'import "firebase-functions/v2/https";',
    ].join("\n"),
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.uiFirebaseSdk).length, 4);
});

test("rejects direct fetch calls from UI", () => {
  const result = inspectFixture({
    "src/App.tsx": [
      'fetch("/one");',
      'window.fetch("/two");',
      'globalThis["fetch"]("/three");',
      'self.fetch("/four");',
    ].join("\n"),
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.uiFetch).length, 4);
});

test("rejects any new or rewritten UI firebaseClient import pair", () => {
  const result = inspectFixture({
    "src/components/ClubTab.tsx": 'import "../lib/firebaseClient";\n',
    "src/components/Other.tsx": 'import "@/lib/firebaseClient";\n',
    "src/lib/firebaseClient.ts": "export {};\n",
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.uiFirebaseClient).length, 2);
});

test("rejects any new or rewritten low-level Google UI import pair", () => {
  const result = inspectFixture({
    "src/App.tsx": [
      'import "./lib/googleDriveAuth";',
      'import "@/lib/googleDriveCabinetPermissionApi";',
    ].join("\n"),
    "src/components/Other.tsx": 'import "@/lib/googleDriveAuth";\n',
    "src/lib/googleDriveAuth.ts": "export {};\n",
    "src/lib/googleDriveCabinetPermissionApi.ts": "export {};\n",
  });

  assert.equal(violationsFor(result, ARCHITECTURE_RULES.uiGoogleProvider).length, 3);
});

test("fails closed on TypeScript syntax errors", () => {
  const result = inspectFixture({
    "src/App.tsx": "const broken = ;\n",
  });

  assert.ok(violationsFor(result, ARCHITECTURE_RULES.parse).length > 0);
});

test("the live outer source satisfies every architecture boundary", () => {
  const result = inspectArchitectureBoundaries({
    repositoryRoot: LIVE_REPOSITORY_ROOT,
  });

  assertNoViolations(result);
});

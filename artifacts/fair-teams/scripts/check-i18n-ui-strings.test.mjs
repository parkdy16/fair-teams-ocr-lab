import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  I18N_UI_RULES,
  formatHardCodedUiStringViolations,
  inspectHardCodedUiStrings,
} from "./check-i18n-ui-strings.mjs";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const LIVE_REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "..");

function inspectFixture(files) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "stripes-i18n-ui-"));
  try {
    const fixtureFiles = {
      "src/App.tsx": "export default function App() { return null; }\n",
      ...files,
    };
    for (const [file, contents] of Object.entries(fixtureFiles)) {
      const destination = resolve(fixtureRoot, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, contents, "utf8");
    }
    return inspectHardCodedUiStrings({ repositoryRoot: fixtureRoot });
  } finally {
    const resolvedFixtureRoot = resolve(fixtureRoot);
    assert.equal(dirname(resolvedFixtureRoot), resolve(tmpdir()));
    assert.match(basename(resolvedFixtureRoot), /^stripes-i18n-ui-/);
    rmSync(resolvedFixtureRoot, { recursive: true, force: true });
  }
}

function policyViolations(result) {
  return result.violations.filter(
    (violation) => violation.ruleId === I18N_UI_RULES.hardCodedUiText,
  );
}

function assertNoViolations(result) {
  assert.equal(
    result.violations.length,
    0,
    `Unexpected i18n UI-string violations:\n${formatHardCodedUiStringViolations(result, { limit: 80 })}`,
  );
}

test("rejects direct English, German, and Korean JSX text", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      export default function App() {
        return <><span>Save changes</span><span>Änderungen speichern</span><span>변경사항 저장</span></>;
      }
    `,
  });

  assert.equal(policyViolations(result).length, 3);
  assert.deepEqual(
    policyViolations(result).map(({ text }) => text),
    ["Save changes", "Änderungen speichern", "변경사항 저장"],
  );
});

test("rejects static JSX expression output without inspecting its conditions", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      declare const busy: boolean;
      declare const ready: boolean;
      declare const name: string;
      declare const team: number;
      declare const fallback: string;
      export default function App() {
        return <>
          <span>{"Save"}</span>
          <span>{busy ? "Saving…" : "Save"}</span>
          <span>{\`Team \${team}\`}</span>
          <span>{"Hello " + name + " now"}</span>
          <span>{fallback || "Unknown"}</span>
          <span>{ready && "Ready"}</span>
        </>;
      }
    `,
  });

  assert.equal(policyViolations(result).length, 8);
});

test("rejects static language in supported presentation attributes", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      declare const busy: boolean;
      declare const player: string;
      declare function Widget(props: Record<string, unknown>): JSX.Element;
      export default function App() {
        return <>
          <button aria-label="Save player" />
          <div aria-description="Player actions" aria-roledescription="carousel" />
          <input aria-placeholder="Search players" aria-valuetext="Half complete" />
          <button title={busy ? "Saving player" : "Save player"} />
          <input placeholder={\`Search for \${player}\`} />
          <img alt="Club badge" />
          <Widget label="Team play" description="Balances collaboration." />
        </>;
      }
    `,
  });

  assert.equal(policyViolations(result).length, 11);
});

test("allows technical attributes, dynamic content, catalog calls, and non-language output", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      declare const player: { name: string };
      declare const tooltip: string;
      declare const value: string;
      declare const other: string;
      declare const t: (key: string) => string;
      const developerMessage = "Failed to initialize internal adapter";
      const mode = "saved";
      export default function App() {
        void developerMessage;
        return <>
          <div className="save player" data-testid="save-player" data-state="open" title={tooltip} />
          <a href="https://example.test/help">{player.name}</a>
          <span>{t("common.save")}</span>
          <span>{mode === "saved" ? value : other}</span>
          <span>• — 123</span>
          <style>{\`.save-player { color: red; }\`}</style>
        </>;
      }
    `,
  });

  assertNoViolations(result);
});

test("allows only a narrowly scoped exemption with a substantive reason", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      export default function App() {
        return <>
          <span>{/* i18n-exempt -- stable provider trademark */ "OAuth"}</span>
          <input aria-label={/* i18n-exempt -- literal technical protocol token */ "HTTPS"} />
        </>;
      }
    `,
  });

  assertNoViolations(result);
});

test("does not honor empty, short, distant, or expression-wide exemptions", () => {
  const result = inspectFixture({
    "src/App.tsx": `
      declare const condition: boolean;
      export default function App() {
        return <>
          <span>{/* i18n-exempt -- no */ "Visible"}</span>
          {/* i18n-exempt -- distant provider-controlled text */}
          <span>Still visible</span>
          <span>{/* i18n-exempt -- applies to no branch */ condition ? "First" : "Second"}</span>
        </>;
      }
    `,
  });

  assert.deepEqual(
    policyViolations(result).map(({ text }) => text),
    ["Visible", "Still visible", "First", "Second"],
  );
});

test("ignores the stale source tree, tests, specs, and backups", () => {
  const result = inspectFixture({
    "src/src/Stale.tsx": "export const Stale = () => <span>Stale text</span>;\n",
    "src/Skipped.test.tsx": "export const Test = () => <span>Test text</span>;\n",
    "src/Skipped.spec.jsx": "export const Spec = () => <span>Spec text</span>;\n",
    "src/Backup.tsx.bak": "export const Backup = () => <span>Backup text</span>;\n",
  });

  assertNoViolations(result);
  assert.equal(result.scannedFileCount, 1);
});

test("fails closed on TypeScript syntax errors", () => {
  const result = inspectFixture({
    "src/App.tsx": "export default function App() { return <div>;\n",
  });

  assert.ok(result.violations.some(
    (violation) => violation.ruleId === I18N_UI_RULES.parse,
  ));
});

test("formats actionable relative-path diagnostics with a bounded preview", () => {
  const result = inspectFixture({
    "src/components/Widget.tsx": `
      export const Widget = () => <button aria-label="Save the current player">Save</button>;
    `,
  });
  const formatted = formatHardCodedUiStringViolations(result);

  assert.match(formatted, /^src\/components\/Widget\.tsx:\d+:\d+ \[i18n\/hard-coded-ui-text\]/m);
  assert.match(formatted, /canonical catalog/);
});

test("the live outer UI source has no hard-coded user-facing strings", () => {
  const result = inspectHardCodedUiStrings({
    repositoryRoot: LIVE_REPOSITORY_ROOT,
  });

  assertNoViolations(result);
});

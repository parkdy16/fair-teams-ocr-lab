import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

export const I18N_UI_RULES = Object.freeze({
  hardCodedUiText: "i18n/hard-coded-ui-text",
  parse: "i18n/source-parse",
  io: "i18n/source-io",
});

const UI_SOURCE_FILE_PATTERN = /\.(?:jsx|tsx)$/i;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:jsx|tsx)$/i;
const HUMAN_LANGUAGE_PATTERN = /\p{L}/u;
const TECHNICAL_CONTENT_ELEMENTS = new Set(["script", "style"]);
const PRESENTATION_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "cancelLabel",
  "confirmLabel",
  "description",
  "emptyMessage",
  "errorMessage",
  "label",
  "loadingMessage",
  "placeholder",
  "title",
]);

function portableRelative(parent, child) {
  return relative(parent, child).split(sep).join("/");
}

function isSameOrInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === ""
    || (!isAbsolute(pathFromParent)
      && pathFromParent !== ".."
      && !pathFromParent.startsWith(`..${sep}`));
}

function isProductionUiSourceFile(filePath) {
  return UI_SOURCE_FILE_PATTERN.test(filePath)
    && !TEST_FILE_PATTERN.test(filePath)
    && !filePath.toLowerCase().endsWith(".bak");
}

function normalizeText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function hasHumanLanguage(text) {
  return HUMAN_LANGUAGE_PATTERN.test(normalizeText(text));
}

function lineAndColumn(sourceFile, nodeOrPosition) {
  const position = typeof nodeOrPosition === "number"
    ? nodeOrPosition
    : nodeOrPosition.getStart(sourceFile, false);
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: location.line + 1, column: location.character + 1 };
}

function addViolation(violations, {
  ruleId,
  filePath,
  line = 1,
  column = 1,
  kind,
  text = "",
  message,
}) {
  violations.push({ ruleId, filePath, line, column, kind, text, message });
}

function discoverProductionUiSources(sourceRoot, staleSourceRoot, violations) {
  const files = [];

  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      addViolation(violations, {
        ruleId: I18N_UI_RULES.io,
        filePath: directory,
        kind: "io",
        message: `Could not inspect the live source tree: ${error.message}`,
      });
      return;
    }

    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (absolutePath !== staleSourceRoot) visit(absolutePath);
        continue;
      }
      if (entry.isFile() && isProductionUiSourceFile(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  try {
    if (!statSync(sourceRoot).isDirectory()) {
      throw new Error("the configured source root is not a directory");
    }
  } catch (error) {
    addViolation(violations, {
      ruleId: I18N_UI_RULES.io,
      filePath: sourceRoot,
      kind: "io",
      message: `Could not locate the live source tree: ${error.message}`,
    });
    return files;
  }

  visit(sourceRoot);
  return files.sort((left, right) => left.localeCompare(right));
}

function jsxElementName(node, sourceFile) {
  if (ts.isJsxElement(node)) {
    return node.openingElement.tagName.getText(sourceFile).toLowerCase();
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText(sourceFile).toLowerCase();
  }
  return null;
}

function isInsideTechnicalContent(node, sourceFile) {
  let current = node;
  while (current) {
    const elementName = jsxElementName(current, sourceFile);
    if (elementName && TECHNICAL_CONTENT_ELEMENTS.has(elementName)) return true;
    current = current.parent;
  }
  return false;
}

function templateStaticText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return "";
  return [
    node.head.text,
    ...node.templateSpans.map((span) => span.literal.text),
  ].join(" ");
}

function collectRenderedLiterals(expression, candidates, kind) {
  if (!expression) return;

  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isNonNullExpression(expression)) {
    collectRenderedLiterals(expression.expression, candidates, kind);
    return;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    if (hasHumanLanguage(expression.text)) {
      candidates.push({ node: expression, text: expression.text, kind });
    }
    return;
  }

  if (ts.isTemplateExpression(expression)) {
    const text = templateStaticText(expression);
    if (hasHumanLanguage(text)) {
      candidates.push({ node: expression, text, kind });
    }
    return;
  }

  if (ts.isConditionalExpression(expression)) {
    collectRenderedLiterals(expression.whenTrue, candidates, kind);
    collectRenderedLiterals(expression.whenFalse, candidates, kind);
    return;
  }

  if (!ts.isBinaryExpression(expression)) return;

  switch (expression.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken:
    case ts.SyntaxKind.BarBarToken:
    case ts.SyntaxKind.QuestionQuestionToken:
      collectRenderedLiterals(expression.left, candidates, kind);
      collectRenderedLiterals(expression.right, candidates, kind);
      break;
    case ts.SyntaxKind.AmpersandAmpersandToken:
      collectRenderedLiterals(expression.right, candidates, kind);
      break;
    default:
      break;
  }
}

function hasScopedExemption(sourceText, node) {
  const trivia = sourceText.slice(node.pos, node.getStart());
  const matches = [...trivia.matchAll(
    /\/\*\s*i18n-exempt\s*--\s*([^*]*?\p{L}[^*]*?)\s*\*\//gu,
  )];
  const match = matches.at(-1);
  if (!match || normalizeText(match[1]).length < 8) return false;
  return /^\s*$/.test(trivia.slice((match.index ?? 0) + match[0].length));
}

function previewText(text) {
  const normalized = normalizeText(text);
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}

function reportCandidate({ sourceFile, filePath, sourceText, violations, candidate }) {
  if (hasScopedExemption(sourceText, candidate.node)) return;
  const text = previewText(candidate.text);
  addViolation(violations, {
    ruleId: I18N_UI_RULES.hardCodedUiText,
    filePath,
    ...lineAndColumn(sourceFile, candidate.node),
    kind: candidate.kind,
    text,
    message: `Move user-facing ${candidate.kind} to the canonical catalog (found ${JSON.stringify(text)}).`,
  });
}

function checkSourceFile(filePath, violations) {
  let sourceText;
  try {
    sourceText = readFileSync(filePath, "utf8");
  } catch (error) {
    addViolation(violations, {
      ruleId: I18N_UI_RULES.io,
      filePath,
      kind: "io",
      message: `Could not read live UI source: ${error.message}`,
    });
    return;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.getScriptKindFromFileName(filePath),
  );

  for (const diagnostic of sourceFile.parseDiagnostics || []) {
    addViolation(violations, {
      ruleId: I18N_UI_RULES.parse,
      filePath,
      ...lineAndColumn(sourceFile, diagnostic.start || 0),
      kind: "parse error",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    });
  }

  function visit(node) {
    if (isInsideTechnicalContent(node, sourceFile)) return;

    if (ts.isJsxText(node) && hasHumanLanguage(node.text)) {
      reportCandidate({
        sourceFile,
        filePath,
        sourceText,
        violations,
        candidate: { node, text: node.text, kind: "JSX text" },
      });
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      const candidates = [];
      collectRenderedLiterals(node.expression, candidates, "JSX expression text");
      for (const candidate of candidates) {
        reportCandidate({ sourceFile, filePath, sourceText, violations, candidate });
      }
    } else if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.getText(sourceFile);
      if (PRESENTATION_ATTRIBUTES.has(attributeName) && node.initializer) {
        const candidates = [];
        if (ts.isStringLiteral(node.initializer)) {
          if (hasHumanLanguage(node.initializer.text)) {
            candidates.push({
              node: node.initializer,
              text: node.initializer.text,
              kind: `${attributeName} attribute`,
            });
          }
        } else if (ts.isJsxExpression(node.initializer)) {
          collectRenderedLiterals(
            node.initializer.expression,
            candidates,
            `${attributeName} attribute`,
          );
        }
        for (const candidate of candidates) {
          reportCandidate({ sourceFile, filePath, sourceText, violations, candidate });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

export function inspectHardCodedUiStrings({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  const normalizedRepositoryRoot = resolve(repositoryRoot);
  const sourceRoot = resolve(normalizedRepositoryRoot, "src");
  const staleSourceRoot = resolve(sourceRoot, "src");
  const violations = [];
  const sourceFiles = discoverProductionUiSources(sourceRoot, staleSourceRoot, violations);

  for (const filePath of sourceFiles) checkSourceFile(filePath, violations);

  violations.sort((left, right) =>
    left.filePath.localeCompare(right.filePath)
      || left.line - right.line
      || left.column - right.column
      || left.ruleId.localeCompare(right.ruleId));

  return {
    repositoryRoot: normalizedRepositoryRoot,
    scannedFileCount: sourceFiles.length,
    violations,
  };
}

export function formatHardCodedUiStringViolations(result, { limit = Infinity } = {}) {
  const visibleViolations = result.violations.slice(0, limit);
  const formatted = visibleViolations.map((violation) => {
    const file = portableRelative(result.repositoryRoot, violation.filePath);
    return `${file}:${violation.line}:${violation.column} [${violation.ruleId}] ${violation.message}`;
  });
  if (visibleViolations.length < result.violations.length) {
    formatted.push(`... ${result.violations.length - visibleViolations.length} more violation(s)`);
  }
  return formatted.join("\n");
}

function runHardCodedUiStringCheck() {
  const result = inspectHardCodedUiStrings();
  if (result.violations.length > 0) {
    console.error(`I18n UI-string check failed with ${result.violations.length} violation(s):`);
    console.error(formatHardCodedUiStringViolations(result));
    process.exitCode = 1;
    return;
  }
  console.log(`I18n UI-string policy passed (${result.scannedFileCount} live UI source files scanned).`);
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) runHardCodedUiStringCheck();

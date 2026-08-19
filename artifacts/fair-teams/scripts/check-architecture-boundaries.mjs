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

export const ARCHITECTURE_RULES = Object.freeze({
  entry: "entry/live-main",
  staleSource: "source/stale-tree",
  relativeEscape: "source/relative-escape",
  libToUi: "layers/lib-to-ui",
  uiFirebaseSdk: "ui/firebase-sdk",
  uiFetch: "ui/fetch",
  uiFirebaseClient: "ui/firebase-client",
  uiGoogleProvider: "ui/google-provider",
  parse: "source/parse",
  io: "source/io",
});

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;

const FIREBASE_CLIENT_MODULE = "src/lib/firebaseClient";
const FIREBASE_CLIENT_ALLOWED_PAIR =
  "src/components/ClubTab.tsx\0@/lib/firebaseClient";

const LOW_LEVEL_GOOGLE_MODULES = new Set([
  "src/lib/googleDriveAuth",
  "src/lib/googleDriveCabinetApi",
  "src/lib/googleDriveCabinetPermissionApi",
  "src/lib/googleDriveFiles",
  "src/lib/googleDrivePicker",
  "src/lib/googleDriveSharedCabinetApi",
  "src/lib/googleSheetsFiles",
]);

const LOW_LEVEL_GOOGLE_ALLOWED_PAIRS = new Set([
  "src/App.tsx\0@/lib/googleDriveAuth",
  "src/App.tsx\0@/lib/googleDriveCabinetApi",
  "src/App.tsx\0@/lib/googleDriveFiles",
  "src/App.tsx\0@/lib/googleSheetsFiles",
  "src/App.tsx\0@/lib/googleDrivePicker",
  "src/components/SharedWorkspaceCabinetCard.tsx\0@/lib/googleDriveCabinetApi",
  "src/components/SharedWorkspaceCabinetCard.tsx\0@/lib/googleDriveSharedCabinetApi",
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

function sourceModulePath(repositoryRoot, absolutePath) {
  return portableRelative(repositoryRoot, absolutePath)
    .replace(/\.(?:[cm]?[jt]sx?)$/i, "");
}

function isProductionSourceFile(filePath) {
  return SOURCE_FILE_PATTERN.test(filePath)
    && !TEST_FILE_PATTERN.test(filePath)
    && !filePath.toLowerCase().endsWith(".bak");
}

function isUiSource(sourcePath) {
  return sourcePath === "src/App.tsx"
    || sourcePath === "src/main.tsx"
    || sourcePath.startsWith("src/components/")
    || sourcePath.startsWith("src/hooks/")
    || sourcePath.startsWith("src/pages/");
}

function isUiModule(modulePath) {
  return modulePath === "src/App"
    || modulePath === "src/main"
    || modulePath === "src/components"
    || modulePath.startsWith("src/components/")
    || modulePath === "src/hooks"
    || modulePath.startsWith("src/hooks/")
    || modulePath === "src/pages"
    || modulePath.startsWith("src/pages/");
}

function addViolation(violations, {
  ruleId,
  filePath,
  line = 1,
  column = 1,
  message,
}) {
  violations.push({ ruleId, filePath, line, column, message });
}

function lineAndColumn(sourceFile, nodeOrPosition) {
  const position = typeof nodeOrPosition === "number"
    ? nodeOrPosition
    : nodeOrPosition.getStart(sourceFile, false);
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: location.line + 1, column: location.character + 1 };
}

function parseHtmlAttributes(attributeSource) {
  const attributes = new Map();
  const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = attributePattern.exec(attributeSource)) !== null) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function isStaleBrowserEntry(source) {
  const pathOnly = source
    .replace(/[?#].*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  return pathOnly === "src/src" || pathOnly.startsWith("src/src/");
}

function checkBrowserEntry(repositoryRoot, violations) {
  const indexPath = resolve(repositoryRoot, "index.html");
  let html;
  try {
    html = readFileSync(indexPath, "utf8");
  } catch (error) {
    addViolation(violations, {
      ruleId: ARCHITECTURE_RULES.io,
      filePath: indexPath,
      message: `Could not read the browser entry document: ${error.message}`,
    });
    return;
  }

  const moduleEntries = [];
  const scriptPattern = /<script\b([^>]*)>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = parseHtmlAttributes(match[1]);
    if (String(attributes.get("type") || "").toLowerCase() !== "module") continue;
    const source = attributes.get("src");
    if (!source) continue;
    const prefix = html.slice(0, match.index);
    moduleEntries.push({
      source,
      line: prefix.split(/\r?\n/).length,
    });
  }

  if (!moduleEntries.some(({ source }) => source === "/src/main.tsx")) {
    addViolation(violations, {
      ruleId: ARCHITECTURE_RULES.entry,
      filePath: indexPath,
      message: "The browser module entry must include the live outer /src/main.tsx file.",
    });
  }

  for (const entry of moduleEntries) {
    if (isStaleBrowserEntry(entry.source)) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.entry,
        filePath: indexPath,
        line: entry.line,
        message: `The stale inner source tree cannot be a browser entry (${entry.source}).`,
      });
    }
  }
}

function discoverProductionSources(sourceRoot, staleSourceRoot, violations) {
  const files = [];

  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.io,
        filePath: directory,
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
      if (entry.isFile() && isProductionSourceFile(absolutePath)) files.push(absolutePath);
    }
  }

  try {
    if (!statSync(sourceRoot).isDirectory()) {
      throw new Error("the configured source root is not a directory");
    }
  } catch (error) {
    addViolation(violations, {
      ruleId: ARCHITECTURE_RULES.io,
      filePath: sourceRoot,
      message: `Could not locate the live source tree: ${error.message}`,
    });
    return files;
  }

  visit(sourceRoot);
  return files.sort((left, right) => left.localeCompare(right));
}

function moduleReferences(sourceFile) {
  const references = [];

  function add(node, moduleSpecifier) {
    if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
      references.push({ node: moduleSpecifier, specifier: moduleSpecifier.text });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node, node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require")
      ) {
        add(node, node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function resolveModuleSpecifier(repositoryRoot, sourceRoot, importerPath, specifier) {
  const cleanSpecifier = specifier.replace(/[?#].*$/, "");
  if (cleanSpecifier === "@") return sourceRoot;
  if (cleanSpecifier.startsWith("@/")) {
    return resolve(sourceRoot, cleanSpecifier.slice(2));
  }
  if (cleanSpecifier === "/src" || cleanSpecifier.startsWith("/src/")) {
    return resolve(repositoryRoot, `.${cleanSpecifier}`);
  }
  if (cleanSpecifier.startsWith(".")) {
    return resolve(dirname(importerPath), cleanSpecifier);
  }
  return null;
}

function isFirebaseSdkSpecifier(specifier) {
  return specifier === "firebase"
    || specifier.startsWith("firebase/")
    || specifier === "firebase-admin"
    || specifier.startsWith("firebase-admin/")
    || specifier === "firebase-functions"
    || specifier.startsWith("firebase-functions/");
}

function isFetchCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "fetch";
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text === "fetch"
      && ts.isIdentifier(callee.expression)
      && ["globalThis", "self", "window"].includes(callee.expression.text);
  }
  if (ts.isElementAccessExpression(callee)) {
    return ts.isIdentifier(callee.expression)
      && ["globalThis", "self", "window"].includes(callee.expression.text)
      && ts.isStringLiteralLike(callee.argumentExpression)
      && callee.argumentExpression.text === "fetch";
  }
  return false;
}

function checkSourceFile({
  repositoryRoot,
  sourceRoot,
  staleSourceRoot,
  filePath,
  violations,
}) {
  let sourceText;
  try {
    sourceText = readFileSync(filePath, "utf8");
  } catch (error) {
    addViolation(violations, {
      ruleId: ARCHITECTURE_RULES.io,
      filePath,
      message: `Could not read live source: ${error.message}`,
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
    const location = lineAndColumn(sourceFile, diagnostic.start || 0);
    addViolation(violations, {
      ruleId: ARCHITECTURE_RULES.parse,
      filePath,
      ...location,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    });
  }

  const importerSourcePath = portableRelative(repositoryRoot, filePath);
  const importerIsUi = isUiSource(importerSourcePath);
  const importerIsLib = importerSourcePath.startsWith("src/lib/");

  for (const reference of moduleReferences(sourceFile)) {
    const { node, specifier } = reference;
    const location = lineAndColumn(sourceFile, node);
    const targetPath = resolveModuleSpecifier(
      repositoryRoot,
      sourceRoot,
      filePath,
      specifier,
    );
    const targetModule = targetPath
      ? sourceModulePath(repositoryRoot, targetPath)
      : null;

    if (targetPath && isSameOrInside(staleSourceRoot, targetPath)) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.staleSource,
        filePath,
        ...location,
        message: `Live source cannot import from the stale src/src tree (${specifier}).`,
      });
    }

    if (
      specifier.startsWith(".")
      && targetPath
      && !isSameOrInside(sourceRoot, targetPath)
    ) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.relativeEscape,
        filePath,
        ...location,
        message: `Relative live-source imports cannot escape src/ (${specifier}).`,
      });
    }

    if (importerIsLib && targetModule && isUiModule(targetModule)) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.libToUi,
        filePath,
        ...location,
        message: `Domain/provider code in src/lib cannot import UI module ${specifier}.`,
      });
    }

    if (!importerIsUi) continue;

    if (isFirebaseSdkSpecifier(specifier)) {
      addViolation(violations, {
        ruleId: ARCHITECTURE_RULES.uiFirebaseSdk,
        filePath,
        ...location,
        message: `UI code must use a Stripes service instead of importing ${specifier} directly.`,
      });
    }

    if (targetModule === FIREBASE_CLIENT_MODULE) {
      const pair = `${importerSourcePath}\0${specifier}`;
      if (pair !== FIREBASE_CLIENT_ALLOWED_PAIR) {
        addViolation(violations, {
          ruleId: ARCHITECTURE_RULES.uiFirebaseClient,
          filePath,
          ...location,
          message: "Only ClubTab's existing exact @/lib/firebaseClient import is grandfathered.",
        });
      }
    }

    if (targetModule && LOW_LEVEL_GOOGLE_MODULES.has(targetModule)) {
      const pair = `${importerSourcePath}\0${specifier}`;
      if (!LOW_LEVEL_GOOGLE_ALLOWED_PAIRS.has(pair)) {
        addViolation(violations, {
          ruleId: ARCHITECTURE_RULES.uiGoogleProvider,
          filePath,
          ...location,
          message: `New direct UI imports of low-level Google provider module ${specifier} are not allowed.`,
        });
      }
    }
  }

  if (importerIsUi) {
    function visitFetchCalls(node) {
      if (isFetchCall(node)) {
        addViolation(violations, {
          ruleId: ARCHITECTURE_RULES.uiFetch,
          filePath,
          ...lineAndColumn(sourceFile, node.expression),
          message: "UI code must use a Stripes service/provider adapter instead of fetch directly.",
        });
      }
      ts.forEachChild(node, visitFetchCalls);
    }
    visitFetchCalls(sourceFile);
  }
}

export function inspectArchitectureBoundaries({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  const normalizedRepositoryRoot = resolve(repositoryRoot);
  const sourceRoot = resolve(normalizedRepositoryRoot, "src");
  const staleSourceRoot = resolve(sourceRoot, "src");
  const violations = [];

  checkBrowserEntry(normalizedRepositoryRoot, violations);
  const sourceFiles = discoverProductionSources(sourceRoot, staleSourceRoot, violations);
  for (const filePath of sourceFiles) {
    checkSourceFile({
      repositoryRoot: normalizedRepositoryRoot,
      sourceRoot,
      staleSourceRoot,
      filePath,
      violations,
    });
  }

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

export function formatArchitectureViolations(result) {
  return result.violations.map((violation) => {
    const file = portableRelative(result.repositoryRoot, violation.filePath);
    return `${file}:${violation.line}:${violation.column} [${violation.ruleId}] ${violation.message}`;
  }).join("\n");
}

function runArchitectureCheck() {
  const result = inspectArchitectureBoundaries();
  if (result.violations.length > 0) {
    console.error(`Architecture boundary check failed with ${result.violations.length} violation(s):`);
    console.error(formatArchitectureViolations(result));
    process.exitCode = 1;
    return;
  }
  console.log(`Architecture boundaries passed (${result.scannedFileCount} live source files scanned).`);
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) runArchitectureCheck();

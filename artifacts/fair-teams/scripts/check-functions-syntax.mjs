import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionsRoot = join(repositoryRoot, "functions");

function discoverJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : discoverJavaScript(absolutePath);
      return entry.name.endsWith(".js") && !entry.name.endsWith(".test.js") ? [absolutePath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

const files = discoverJavaScript(functionsRoot);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`Functions syntax check failed: ${relative(repositoryRoot, file)}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Functions syntax checks passed (${files.length} files).`);

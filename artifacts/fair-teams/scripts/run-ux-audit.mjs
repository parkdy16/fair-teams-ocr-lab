import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const resultsDirectory = path.join(projectRoot, "ux-audit-results");
const galleryScript = path.join(scriptDirectory, "build-ux-audit-gallery.mjs");

await rm(resultsDirectory, { recursive: true, force: true });
await mkdir(resultsDirectory, { recursive: true });

console.log("\nStripes Visual UX Audit");
console.log("Capturing deterministic states across phone, tablet and desktop viewports.\n");

const capture = spawnSync(
  process.platform === "win32" ? "playwright.cmd" : "playwright",
  ["test", "--config", "playwright.ux-audit.config.ts"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

const gallery = spawnSync(process.execPath, [galleryScript], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

if (gallery.error) {
  console.error("Unable to build the UX audit gallery:", gallery.error.message);
  process.exit(1);
}
if (gallery.status !== 0) process.exit(gallery.status ?? 1);

console.log("\nUX audit evidence is ready:");
console.log(path.join(resultsDirectory, "index.html"));
console.log("\nTo share the complete evidence bundle from Git Bash:");
console.log('tar -a -c -f "$HOME/Desktop/Stripes-UX-Audit.zip" -C artifacts/fair-teams ux-audit-results');

if (capture.error) {
  console.error("\nPlaywright failed to start:", capture.error.message);
  process.exit(1);
}
if (capture.status !== 0) {
  console.error("\nSome audit scenarios failed. The gallery still contains any evidence captured before failure.");
  process.exit(capture.status ?? 1);
}

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const auditRoot = path.join(projectRoot, "ux-audit-results");
const entriesRoot = path.join(auditRoot, "entries");
const projectOrder = ["phone-390", "phone-430", "tablet-768", "desktop-1440"];

async function walkJson(directory) {
  let items = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return items;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) items = items.concat(await walkJson(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".json")) items.push(fullPath);
  }
  return items;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pathForHtml(value) {
  return String(value ?? "").split(path.sep).join("/");
}

function metricBadge(label, value, tone = "neutral") {
  return `<span class="badge badge-${tone}"><strong>${escapeHtml(value)}</strong> ${escapeHtml(label)}</span>`;
}

function entryCard(entry) {
  const summary = entry.summary ?? {};
  const overflowTone = summary.horizontalOverflow ? "danger" : "good";
  const targetTone = Number(summary.smallTouchTargets || 0) > 0 ? "warn" : "good";
  const statusTone = entry.status === "passed" ? "good" : "danger";
  return `
    <article class="capture-card" data-project="${escapeHtml(entry.project)}" data-status="${escapeHtml(entry.status)}">
      <div class="capture-header">
        <div>
          <div class="project-label">${escapeHtml(entry.project)}</div>
          <div class="viewport-label">${escapeHtml(entry.viewport?.width)} × ${escapeHtml(entry.viewport?.height)}</div>
        </div>
        ${metricBadge("status", entry.status, statusTone)}
      </div>
      <a class="image-link" href="${escapeHtml(pathForHtml(entry.screenshot))}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(pathForHtml(entry.screenshot))}" alt="${escapeHtml(entry.title)} at ${escapeHtml(entry.project)}" loading="lazy" />
      </a>
      <div class="metric-row">
        ${metricBadge("horizontal overflow", summary.horizontalOverflow ? "yes" : "no", overflowTone)}
        ${metricBadge("small targets", summary.smallTouchTargets ?? 0, targetTone)}
        ${metricBadge("dialogs", summary.dialogs ?? 0)}
        ${metricBadge("small text", summary.smallTextElements ?? 0, Number(summary.smallTextElements || 0) > 25 ? "warn" : "neutral")}
      </div>
      <div class="artifact-links">
        <a href="${escapeHtml(pathForHtml(entry.ariaSnapshot))}" target="_blank" rel="noreferrer">ARIA snapshot</a>
        <a href="${escapeHtml(pathForHtml(entry.metrics))}" target="_blank" rel="noreferrer">Visual metrics</a>
        <a href="${escapeHtml(pathForHtml(entry.trace))}" target="_blank" rel="noreferrer">Interaction trace</a>
      </div>
      ${entry.errorMessage ? `<div class="capture-error">${escapeHtml(entry.errorMessage)}</div>` : ""}
      ${(entry.consoleDiagnostics?.length || entry.blockedExternalRequests?.length) ? `
        <details>
          <summary>Diagnostics</summary>
          <pre>${escapeHtml(JSON.stringify({
            console: entry.consoleDiagnostics,
            blockedExternalRequests: entry.blockedExternalRequests,
          }, null, 2))}</pre>
        </details>
      ` : ""}
    </article>
  `;
}

const entryFiles = await walkJson(entriesRoot);
const auditEntries = [];
for (const filePath of entryFiles) {
  try {
    auditEntries.push(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    console.warn(`Skipping invalid audit entry ${filePath}: ${error instanceof Error ? error.message : error}`);
  }
}

auditEntries.sort((left, right) => {
  const orderDifference = Number(left.order || 0) - Number(right.order || 0);
  if (orderDifference) return orderDifference;
  const leftProject = projectOrder.indexOf(left.project);
  const rightProject = projectOrder.indexOf(right.project);
  return leftProject - rightProject;
});

const grouped = new Map();
for (const entry of auditEntries) {
  const group = grouped.get(entry.scenarioId) ?? {
    scenarioId: entry.scenarioId,
    order: entry.order,
    title: entry.title,
    goal: entry.goal,
    task: entry.task,
    entries: [],
  };
  group.entries.push(entry);
  grouped.set(entry.scenarioId, group);
}

const groups = [...grouped.values()].sort((left, right) => left.order - right.order);
const scenarioNavigation = groups.map((group) => (
  `<a href="#${escapeHtml(group.scenarioId)}"><span>${escapeHtml(group.order)}</span>${escapeHtml(group.title)}</a>`
)).join("\n");

const scenarioSections = groups.map((group) => {
  const entries = [...group.entries].sort((left, right) => projectOrder.indexOf(left.project) - projectOrder.indexOf(right.project));
  return `
    <section id="${escapeHtml(group.scenarioId)}" class="scenario" data-search="${escapeHtml(`${group.title} ${group.goal} ${group.task}`.toLowerCase())}">
      <div class="scenario-heading">
        <div class="scenario-number">${String(group.order).padStart(2, "0")}</div>
        <div>
          <h2>${escapeHtml(group.title)}</h2>
          <p class="goal">${escapeHtml(group.goal)}</p>
          <p class="task"><strong>Captured task:</strong> ${escapeHtml(group.task)}</p>
        </div>
      </div>
      <div class="capture-grid">
        ${entries.map(entryCard).join("\n")}
      </div>
    </section>
  `;
}).join("\n");

const manifest = {
  app: "Stripes",
  type: "visual-ux-audit",
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projects: projectOrder,
  scenarioCount: groups.length,
  captureCount: auditEntries.length,
  scenarios: groups,
};

const reviewPrompt = `# Stripes Visual UX Audit — AI review prompt

Review the attached Stripes UX audit evidence as a product designer and interaction designer.

## Product intent

Stripes should feel fast, approachable, tactile, social, confidently simple and slightly playful. It should not feel childish, arcade-like, corporate-SaaS-heavy, tactically overcomplicated, visually noisy, postal-themed, or assembled from unrelated component examples.

## Priorities

1. Clarity of the next useful action.
2. Speed for recurring organizers.
3. Optional complexity remaining visibly optional.
4. One-handed mobile usability and honest touch targets.
5. Consistency across related flows.
6. Approachable personality without gimmicks.
7. Visual hierarchy, spacing, typography and restraint.
8. Safe destructive actions and understandable save behavior.
9. Responsive behavior across the four captured viewports.
10. Accessibility evidence from the ARIA snapshots.

## Required output

For each finding, provide:

- exact scenario and viewport;
- exact element or interaction;
- severity: blocker, friction, inconsistency or polish;
- whether it is a UX problem, visual/art-direction problem, accessibility problem or implementation artifact;
- user consequence;
- minimal correction;
- stronger redesign alternative;
- confidence: high, medium or low.

Then provide:

1. the top ten findings ranked by user impact;
2. cross-screen design-system inconsistencies;
3. Keep / Change / Remove decisions for the experimental JoonGPT additions;
4. three alternative concepts only for the highest-friction flow;
5. a recommended implementation sequence;
6. items that should be adopted into the canonical Stripes roadmap and production main branch after approval.

Do not suggest code until the interaction hierarchy and visual target are explicit. Do not redesign unrelated mature infrastructure.
`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stripes Visual UX Audit</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: #f5f7fb; color: #102a43; }
    a { color: inherit; }
    .shell { display: grid; grid-template-columns: minmax(220px, 290px) minmax(0, 1fr); min-height: 100vh; }
    aside { position: sticky; top: 0; height: 100vh; overflow-y: auto; border-right: 1px solid #dbe5ef; background: #fff; padding: 24px 18px; }
    aside h1 { margin: 0; font-size: 20px; letter-spacing: -0.03em; }
    aside p { margin: 8px 0 18px; color: #627d98; font-size: 12px; line-height: 1.5; }
    nav { display: grid; gap: 4px; }
    nav a { display: grid; grid-template-columns: 28px 1fr; gap: 8px; align-items: center; border-radius: 12px; padding: 8px 10px; color: #486581; font-size: 12px; font-weight: 750; text-decoration: none; }
    nav a:hover { background: #edf2f7; color: #102a43; }
    nav span { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 8px; background: #edf2ff; color: #4f46e5; font-size: 9px; }
    main { min-width: 0; padding: 28px clamp(16px, 3vw, 48px) 80px; }
    .hero { border: 1px solid #dbe5ef; border-radius: 28px; background: linear-gradient(135deg, #102a43, #315f87); color: white; padding: clamp(22px, 4vw, 42px); box-shadow: 0 18px 50px rgba(16,42,67,.16); }
    .hero h1 { margin: 0; font-size: clamp(28px, 5vw, 48px); letter-spacing: -0.045em; }
    .hero p { max-width: 820px; margin: 12px 0 0; color: rgba(255,255,255,.78); line-height: 1.6; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
    .hero-meta span { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(255,255,255,.08); padding: 7px 10px; font-size: 11px; font-weight: 800; }
    .toolbar { position: sticky; top: 12px; z-index: 20; display: flex; gap: 10px; align-items: center; margin: 20px 0; border: 1px solid #dbe5ef; border-radius: 18px; background: rgba(255,255,255,.94); padding: 10px; backdrop-filter: blur(14px); box-shadow: 0 8px 24px rgba(16,42,67,.08); }
    .toolbar input { min-width: 0; flex: 1; border: 0; outline: 0; font: inherit; font-size: 13px; }
    .toolbar a { border-radius: 12px; background: #eef2ff; padding: 8px 10px; color: #4338ca; font-size: 11px; font-weight: 850; text-decoration: none; white-space: nowrap; }
    .scenario { scroll-margin-top: 88px; margin-top: 30px; }
    .scenario-heading { display: grid; grid-template-columns: 48px 1fr; gap: 14px; align-items: start; margin-bottom: 14px; }
    .scenario-number { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 15px; background: #4f46e5; color: white; font-size: 11px; font-weight: 900; }
    h2 { margin: 0; font-size: 23px; letter-spacing: -0.03em; }
    .goal { margin: 5px 0 0; color: #486581; line-height: 1.5; }
    .task { margin: 7px 0 0; color: #829ab1; font-size: 12px; }
    .capture-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .capture-card { min-width: 0; overflow: hidden; border: 1px solid #dbe5ef; border-radius: 22px; background: white; box-shadow: 0 8px 24px rgba(16,42,67,.06); }
    .capture-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 12px 10px; }
    .project-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .viewport-label { margin-top: 2px; color: #829ab1; font-size: 10px; font-weight: 750; }
    .image-link { display: block; border-block: 1px solid #e6edf3; background: #eaf0f6; }
    .image-link img { display: block; width: 100%; height: auto; max-height: 720px; object-fit: contain; object-position: top center; }
    .metric-row { display: flex; flex-wrap: wrap; gap: 5px; padding: 10px 12px 4px; }
    .badge { display: inline-flex; gap: 4px; align-items: center; border-radius: 999px; background: #edf2f7; padding: 4px 7px; color: #627d98; font-size: 9px; font-weight: 750; }
    .badge strong { color: #243b53; }
    .badge-good { background: #e8f8ef; color: #18794e; }
    .badge-good strong { color: #11613d; }
    .badge-warn { background: #fff7db; color: #8a5b00; }
    .badge-warn strong { color: #6b4500; }
    .badge-danger { background: #fff0f0; color: #c53030; }
    .badge-danger strong { color: #9b2c2c; }
    .artifact-links { display: flex; flex-wrap: wrap; gap: 9px; padding: 8px 12px 12px; }
    .artifact-links a { color: #4f46e5; font-size: 10px; font-weight: 800; text-decoration: none; }
    .artifact-links a:hover { text-decoration: underline; }
    details { border-top: 1px solid #edf2f7; padding: 8px 12px 12px; }
    summary { cursor: pointer; color: #627d98; font-size: 10px; font-weight: 850; }
    pre { max-height: 240px; overflow: auto; border-radius: 12px; background: #102a43; color: #d9e2ec; padding: 10px; font-size: 9px; white-space: pre-wrap; }
    .capture-error { margin: 8px 12px 12px; border-radius: 12px; background: #fff0f0; padding: 9px; color: #9b2c2c; font-size: 10px; font-weight: 750; }
    .hidden-by-search { display: none; }
    @media (max-width: 1250px) { .capture-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) {
      .shell { display: block; }
      aside { position: static; width: auto; height: auto; border-right: 0; border-bottom: 1px solid #dbe5ef; }
      nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      main { padding: 18px 12px 60px; }
      .toolbar { top: 6px; }
      .capture-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <h1>Stripes UX Audit</h1>
      <p>Visual evidence from deterministic app states. Compare each row across the same four viewports.</p>
      <nav>${scenarioNavigation}</nav>
    </aside>
    <main>
      <header class="hero">
        <h1>Visual UX Audit 0.1</h1>
        <p>This gallery captures the current experimental Stripes app before further redesign. It combines viewport screenshots, accessibility snapshots, browser traces and measurable visual signals so design decisions can be evidence-led.</p>
        <div class="hero-meta">
          <span>${groups.length} scenarios</span>
          <span>${auditEntries.length} captures</span>
          <span>${projectOrder.length} viewports</span>
          <span>Experimental branch only</span>
        </div>
      </header>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Filter scenarios…" aria-label="Filter scenarios" />
        <a href="audit-manifest.json">Manifest</a>
        <a href="AI_REVIEW_PROMPT.md">AI review prompt</a>
        <a href="playwright-report/index.html">Playwright report</a>
      </div>
      ${scenarioSections || '<p>No audit captures were found. Run <code>pnpm run audit:ux</code>.</p>'}
    </main>
  </div>
  <script>
    const search = document.getElementById('search');
    search?.addEventListener('input', () => {
      const value = search.value.trim().toLowerCase();
      for (const section of document.querySelectorAll('.scenario')) {
        section.classList.toggle('hidden-by-search', Boolean(value) && !section.dataset.search.includes(value));
      }
    });
    window.__STRIPES_UX_AUDIT__ = ${JSON.stringify(manifest)};
  </script>
</body>
</html>`;

await mkdir(auditRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(auditRoot, "audit-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  writeFile(path.join(auditRoot, "AI_REVIEW_PROMPT.md"), reviewPrompt, "utf8"),
  writeFile(path.join(auditRoot, "index.html"), html, "utf8"),
]);

console.log(`Built UX audit gallery with ${groups.length} scenarios and ${auditEntries.length} captures.`);

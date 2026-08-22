import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

const rosterStorageKey = "fair-teams-rosters-v1";
const activeRosterStorageKey = "fair-teams-active-roster-id-v1";
const onboardingStorageKey = "fairteams-onboarding-v140-complete";
const auditRoot = path.resolve("ux-audit-results");
const allowedExternalHosts = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const blockedExternalRequests = new WeakMap<BrowserContext, string[]>();

const fixedTimestamp = "2026-08-22T08:00:00.000Z";
const footballNames = [
  "Alex Morgan",
  "Bea Schneider",
  "Chris Park",
  "Dani Martínez",
  "Eli Johnson",
  "François Lambert",
  "Gina Russo",
  "Haruto Watanabe",
  "Isabella Rossi",
  "Jae-min Kim",
  "Klara Hoffmann",
  "Luka Petrović",
  "Maya Thompson",
  "Noah Williams",
  "Olivia Fernández",
  "Peter van der Meer",
];

export type AuditScenarioDefinition = {
  id: string;
  order: number;
  title: string;
  goal: string;
  task: string;
};

type ConsoleDiagnostic = {
  type: string;
  text: string;
};

type AuditEntryStatus = "passed" | "failed";

type AuditScenarioContext = {
  page: Page;
  context: BrowserContext;
};

function safeFileSegment(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "audit-state";
}

function relativeAuditPath(...parts: string[]) {
  return parts.join("/");
}

function auditPlayer(name: string, index: number) {
  const skill = Math.max(2.5, Math.min(9.5, Math.round((4.5 + (index % 8) * 0.55) * 2) / 2));
  return {
    id: `audit-player-${index + 1}`,
    roomId: 1,
    name,
    aka: index === 5 ? "Frank" : "",
    gender: index % 2 === 0 ? "male" : "female",
    skill,
    attack: Math.min(10, skill + (index % 3 === 0 ? 1 : 0)),
    defense: Math.max(1, skill + (index % 3 === 2 ? 1 : -0.5)),
    speed: Math.min(10, skill + (index % 5 === 0 ? 1 : 0)),
    passing: Math.min(10, skill + (index % 4 === 1 ? 1 : 0)),
    stamina: Math.min(10, skill + (index % 5 === 2 ? 1 : 0)),
    physical: Math.min(10, skill + (index % 4 === 3 ? 1 : 0)),
    teamPlay: 2,
    todayStatus: "here",
    attending: true,
    isNew: index >= 12,
    isGoalkeeper: index === 0 || index === 8,
    funBadge: index === 2 ? "social" : undefined,
    createdAt: fixedTimestamp,
    updatedAt: fixedTimestamp,
  };
}

export const auditFootballRoster = {
  id: "audit-roster-football",
  name: "Thursday Football — Social Session",
  players: footballNames.map(auditPlayer),
  pairingRules: [],
  themeColor: "#4f46e5",
  logo: "",
  createdAt: fixedTimestamp,
  updatedAt: fixedTimestamp,
};

export const auditEmptyRoster = {
  id: "audit-roster-empty",
  name: "New Community Activity",
  players: [],
  pairingRules: [],
  themeColor: "#ffffff",
  logo: "",
  createdAt: fixedTimestamp,
  updatedAt: fixedTimestamp,
};

export const auditSharedRoster = {
  ...auditFootballRoster,
  id: "audit-roster-shared",
  name: "Shared Training Group",
  cloudSource: {
    provider: "firebase",
    firebaseRosterId: "audit-shared-roster",
    firebaseGroupId: "audit-shared-group",
    firebaseGroupName: "Shared Training Group",
    firebaseRole: "organizer",
    syncMode: "manual",
  },
};

export function createLongContentRoster() {
  const names = Array.from({ length: 30 }, (_, index) =>
    index % 5 === 0
      ? `Player ${index + 1} With an Exceptionally Long Display Name`
      : `Player ${index + 1}`,
  );

  return {
    ...auditFootballRoster,
    id: "audit-roster-long-content",
    name: "A Very Long Recreational Club Name for Responsive Stress Testing",
    players: names.map((name, index) => ({
      ...auditPlayer(name, index + 80),
      id: `audit-long-player-${index + 1}`,
    })),
  };
}

export async function installAuditNetworkGuard(context: BrowserContext) {
  const blocked: string[] = [];
  blockedExternalRequests.set(context, blocked);

  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    const hostname = new URL(requestUrl).hostname;

    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
      return;
    }

    if (allowedExternalHosts.has(hostname)) {
      await route.continue();
      return;
    }

    blocked.push(requestUrl);
    await route.abort("blockedbyclient");
  });
}

export async function seedAuditApp(
  page: Page,
  activeRosterId = auditFootballRoster.id,
  rosters = [auditFootballRoster, auditEmptyRoster],
) {
  await page.addInitScript(
    ({ rosterKey, activeKey, onboardingKey, activeId, rosterValues }) => {
      window.localStorage.setItem(onboardingKey, "1");
      window.localStorage.setItem(activeKey, activeId);
      window.localStorage.setItem(rosterKey, JSON.stringify({
        app: "Stripes",
        version: 1,
        activeRosterId: activeId,
        rosters: rosterValues,
      }));
    },
    {
      rosterKey: rosterStorageKey,
      activeKey: activeRosterStorageKey,
      onboardingKey: onboardingStorageKey,
      activeId: activeRosterId,
      rosterValues: rosters,
    },
  );

  await page.goto("/app");
}

async function waitForAuditLocatorToAttach(locator: Locator, description: string) {
  if ((await locator.count()) > 0) return;
  try {
    await locator.first().waitFor({ state: "attached", timeout: 10_000 });
  } catch {
    throw new Error(`No ${description} appeared after the app became ready.`);
  }
}

export async function visibleAuditLocator(locator: Locator, description: string) {
  await waitForAuditLocatorToAttach(locator, description);

  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }

  throw new Error(`No visible ${description} was found for this viewport.`);
}

export async function activateAuditControl(
  locator: Locator,
  description: string,
) {
  const candidate = await visibleAuditLocator(locator, description);
  await candidate.scrollIntoViewIfNeeded();
  await candidate.click();
}

export async function enterAuditRoster(page: Page, rosterName = auditFootballRoster.name) {
  await activateAuditControl(
    page.locator("button").filter({ hasText: rosterName }),
    `roster button for ${rosterName}`,
  );

  const rosterTab = await visibleAuditLocator(
    page.getByRole("tab", { name: "Roster", exact: true }),
    "Roster navigation tab",
  );

  await rosterTab.click();
  await expect(rosterTab).toHaveAttribute("data-state", "active");
}

export async function openRosterSettings(page: Page) {
  await activateAuditControl(
    page.getByRole("button", { name: /^(?:Settings|Roster tools)$/i }),
    "Settings / Roster tools button",
  );
}

async function stabilizeForCapture(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    if (!document.fonts?.ready) return;
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 2_000)),
    ]);
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0ms !important;
        transition-duration: 0.001ms !important;
        transition-delay: 0ms !important;
        caret-color: transparent !important;
      }
    `,
  }).catch(() => undefined);
  await page.waitForTimeout(120);
}

async function collectVisualMetrics(page: Page) {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0
        && rect.width > 0
        && rect.height > 0;
    };

    const visibleElements = Array.from(document.querySelectorAll("body *")).filter(isVisible) as HTMLElement[];
    const interactive = Array.from(document.querySelectorAll(
      "button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='switch'], [role='checkbox'], [role='radio']",
    )).filter(isVisible) as HTMLElement[];

    const frequencies = (values: string[], limit = 12) => {
      const counts = new Map<string, number>();
      for (const value of values) {
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));
    };

    const interactiveInventory = interactive.slice(0, 400).map((element) => {
      const rect = element.getBoundingClientRect();
      const role = element.getAttribute("role") || element.tagName.toLowerCase();
      return {
        role,
        text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160),
        ariaLabel: element.getAttribute("aria-label") || "",
        testId: element.getAttribute("data-testid") || "",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      };
    });

    const unlabeledInteractive = interactiveInventory.filter((item) => !item.text && !item.ariaLabel).length;
    const smallTouchTargets = interactiveInventory.filter((item) => item.width < 44 || item.height < 44).length;
    const overflowingElements = visibleElements.filter((element) => element.scrollWidth > element.clientWidth + 2).length;
    const dialogs = visibleElements.filter((element) => (
      element.getAttribute("role") === "dialog" || element.getAttribute("aria-modal") === "true"
    )).length;

    let maxZIndex = 0;
    for (const element of visibleElements) {
      const value = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
      if (Number.isFinite(value)) maxZIndex = Math.max(maxZIndex, value);
    }

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      },
      counts: {
        visibleElements: visibleElements.length,
        interactiveElements: interactive.length,
        smallTouchTargets,
        unlabeledInteractive,
        overflowingElements,
        dialogs,
        fixedElements: visibleElements.filter((element) => window.getComputedStyle(element).position === "fixed").length,
        stickyElements: visibleElements.filter((element) => window.getComputedStyle(element).position === "sticky").length,
        smallTextElements: visibleElements.filter((element) => Number.parseFloat(window.getComputedStyle(element).fontSize) < 12).length,
      },
      maxZIndex,
      visualTokens: {
        fontSizes: frequencies(visibleElements.map((element) => window.getComputedStyle(element).fontSize)),
        fontWeights: frequencies(visibleElements.map((element) => window.getComputedStyle(element).fontWeight)),
        borderRadii: frequencies(visibleElements.map((element) => window.getComputedStyle(element).borderRadius)),
        backgroundColors: frequencies(visibleElements.map((element) => window.getComputedStyle(element).backgroundColor)),
        textColors: frequencies(visibleElements.map((element) => window.getComputedStyle(element).color)),
      },
      interactiveInventory,
    };
  });
}

async function captureAuditEntry(
  page: Page,
  context: BrowserContext,
  testInfo: TestInfo,
  definition: AuditScenarioDefinition,
  traceRelativePath: string,
  status: AuditEntryStatus,
  consoleDiagnostics: ConsoleDiagnostic[],
  errorMessage = "",
) {
  await stabilizeForCapture(page);
  const project = safeFileSegment(testInfo.project.name);
  const state = safeFileSegment(definition.id);
  const screenshotRelativePath = relativeAuditPath("screenshots", project, `${state}.png`);
  const ariaRelativePath = relativeAuditPath("aria", project, `${state}.yml`);
  const metricsRelativePath = relativeAuditPath("metrics", project, `${state}.json`);
  const entryRelativePath = relativeAuditPath("entries", project, `${state}.json`);
  const screenshotPath = path.join(auditRoot, ...screenshotRelativePath.split("/"));
  const ariaPath = path.join(auditRoot, ...ariaRelativePath.split("/"));
  const metricsPath = path.join(auditRoot, ...metricsRelativePath.split("/"));
  const entryPath = path.join(auditRoot, ...entryRelativePath.split("/"));

  await Promise.all([
    mkdir(path.dirname(screenshotPath), { recursive: true }),
    mkdir(path.dirname(ariaPath), { recursive: true }),
    mkdir(path.dirname(metricsPath), { recursive: true }),
    mkdir(path.dirname(entryPath), { recursive: true }),
  ]);

  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });

  let ariaSnapshot = "";
  try {
    ariaSnapshot = await page.locator("body").ariaSnapshot({ boxes: true });
  } catch (error) {
    ariaSnapshot = `# ARIA snapshot unavailable\n# ${error instanceof Error ? error.message : String(error)}\n`;
  }

  const metrics = await collectVisualMetrics(page);
  const blockedRequests = blockedExternalRequests.get(context) ?? [];
  const viewport = page.viewportSize();
  const entry = {
    schemaVersion: 1,
    scenarioId: definition.id,
    order: definition.order,
    title: definition.title,
    goal: definition.goal,
    task: definition.task,
    status,
    errorMessage,
    project: testInfo.project.name,
    viewport,
    url: page.url(),
    screenshot: screenshotRelativePath,
    ariaSnapshot: ariaRelativePath,
    metrics: metricsRelativePath,
    trace: traceRelativePath,
    blockedExternalRequests: [...new Set(blockedRequests)].slice(0, 100),
    consoleDiagnostics: consoleDiagnostics.slice(0, 100),
    capturedAt: new Date().toISOString(),
    summary: {
      horizontalOverflow: metrics.document.horizontalOverflow,
      dialogs: metrics.counts.dialogs,
      interactiveElements: metrics.counts.interactiveElements,
      smallTouchTargets: metrics.counts.smallTouchTargets,
      unlabeledInteractive: metrics.counts.unlabeledInteractive,
      smallTextElements: metrics.counts.smallTextElements,
    },
  };

  await Promise.all([
    writeFile(ariaPath, ariaSnapshot, "utf8"),
    writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8"),
    writeFile(entryPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8"),
  ]);

  await testInfo.attach(`${definition.id}-${testInfo.project.name}`, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

export async function runAuditScenario(
  fixtures: AuditScenarioContext,
  testInfo: TestInfo,
  definition: AuditScenarioDefinition,
  action: () => Promise<void>,
) {
  const project = safeFileSegment(testInfo.project.name);
  const state = safeFileSegment(definition.id);
  const traceRelativePath = relativeAuditPath("traces", project, `${state}.zip`);
  const tracePath = path.join(auditRoot, ...traceRelativePath.split("/"));
  const consoleDiagnostics: ConsoleDiagnostic[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (["warning", "error"].includes(message.type())) {
      consoleDiagnostics.push({ type: message.type(), text: message.text().slice(0, 500) });
    }
  };
  const onPageError = (error: Error) => {
    consoleDiagnostics.push({ type: "pageerror", text: error.message.slice(0, 500) });
  };
  fixtures.page.on("console", onConsole);
  fixtures.page.on("pageerror", onPageError);
  await mkdir(path.dirname(tracePath), { recursive: true });
  await fixtures.context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  let status: AuditEntryStatus = "passed";
  let errorMessage = "";
  try {
    await action();
    await captureAuditEntry(
      fixtures.page,
      fixtures.context,
      testInfo,
      definition,
      traceRelativePath,
      status,
      consoleDiagnostics,
    );
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    try {
      await captureAuditEntry(
        fixtures.page,
        fixtures.context,
        testInfo,
        definition,
        traceRelativePath,
        status,
        consoleDiagnostics,
        errorMessage,
      );
    } catch {
      // Preserve the original scenario error when emergency capture also fails.
    }
    throw error;
  } finally {
    fixtures.page.off("console", onConsole);
    fixtures.page.off("pageerror", onPageError);
    await fixtures.context.tracing.stop({ path: tracePath }).catch(() => undefined);
  }
}

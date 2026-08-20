import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const rosterStorageKey = "fair-teams-rosters-v1";
const activeRosterStorageKey = "fair-teams-active-roster-id-v1";
const onboardingStorageKey = "fairteams-onboarding-v140-complete";
const uiLocaleStorageKey = "stripes-ui-locale-v1";
const expectedStaticExternalHosts = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const unexpectedExternalRequests = new WeakMap<BrowserContext, string[]>();

const playerNames = ["Alex", "Bea", "Chris", "Dani", "Eli", "Fran"];

function player(name: string, index: number) {
  const skill = 4 + (index % 4);
  return {
    id: `smoke-player-${index + 1}`,
    roomId: 1,
    name,
    gender: index % 2 === 0 ? "male" : "female",
    skill,
    attack: skill,
    defense: skill,
    speed: skill,
    passing: skill,
    stamina: skill,
    physical: skill,
    teamPlay: 2,
    todayStatus: "here",
    attending: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const alphaRoster = {
  id: "smoke-roster-alpha",
  name: "Alpha FC",
  players: playerNames.map(player),
  pairingRules: [],
  themeColor: "#2563eb",
  logo: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const betaRoster = {
  id: "smoke-roster-beta",
  name: "Beta FC",
  players: playerNames.slice(0, 4).map((name, index) => player(`${name} B`, index + 10)),
  pairingRules: [],
  themeColor: "#0f766e",
  logo: "",
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const signedOutSharedRoster = {
  ...alphaRoster,
  id: "smoke-roster-shared",
  name: "Shared Smoke FC",
  cloudSource: {
    provider: "firebase",
    firebaseRosterId: "smoke-shared-roster",
    firebaseGroupId: "smoke-shared-group",
    firebaseGroupName: "Shared Smoke FC",
    firebaseRole: "organizer",
    syncMode: "manual",
  },
};

async function installNetworkGuard(context: BrowserContext) {
  const unexpectedRequests: string[] = [];
  unexpectedExternalRequests.set(context, unexpectedRequests);
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    const hostname = new URL(requestUrl).hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
      return;
    }
    if (!expectedStaticExternalHosts.has(hostname)) {
      unexpectedRequests.push(requestUrl);
    }
    await route.abort("blockedbyclient");
  });
}

async function seedLocalApp(
  page: Page,
  activeRosterId = alphaRoster.id,
  rosters = [alphaRoster, betaRoster],
) {
  await page.addInitScript(
    ({ rosterKey, activeKey, onboardingKey, activeId, rosters }) => {
      window.localStorage.setItem(onboardingKey, "1");
      window.localStorage.setItem(activeKey, activeId);
      window.localStorage.setItem(rosterKey, JSON.stringify({
        app: "Stripes",
        version: 1,
        activeRosterId: activeId,
        rosters,
      }));
    },
    {
      rosterKey: rosterStorageKey,
      activeKey: activeRosterStorageKey,
      onboardingKey: onboardingStorageKey,
      activeId: activeRosterId,
      rosters,
    },
  );
  await page.goto("/app");
}

async function enterActiveRoster(page: Page, rosterName = "Alpha FC") {
  await page.locator("button").filter({ hasText: rosterName }).first().click();
  await expect(page.locator("aside")).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await installNetworkGuard(context);
});

test.afterEach(async ({ context }) => {
  expect(
    unexpectedExternalRequests.get(context) ?? [],
    "Browser smoke attempted an unexpected external request",
  ).toEqual([]);
});

test("application boots into the deterministic local workspace chooser", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await seedLocalApp(page);

  await expect(page.getByRole("heading", { name: "Hey," })).toBeVisible();
  await expect(page.getByText("Choose your roster.", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha FC", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Roster, Teams, and Club shell navigation remains enterable", async ({ page }) => {
  await seedLocalApp(page);
  await enterActiveRoster(page);

  const sidebar = page.locator("aside");
  const rosterTab = sidebar.getByRole("tab", { name: "Roster", exact: true });
  const teamsTab = sidebar.getByRole("tab", { name: "Teams", exact: true });
  const clubTab = sidebar.getByRole("tab", { name: "Club", exact: true });

  await rosterTab.click();
  await expect(rosterTab).toHaveAttribute("data-state", "active");
  await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(6);

  await teamsTab.click();
  await expect(teamsTab).toHaveAttribute("data-state", "active");
  await expect(page.getByTestId("desktop-generate-teams")).toBeVisible();

  await clubTab.click();
  await expect(clubTab).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Club Access", { exact: true })).toBeVisible();
});

test("the start workspace can switch between deterministic local rosters", async ({ page }) => {
  await seedLocalApp(page);

  await page.getByRole("button", { name: /Change roster/ }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("heading", { name: "Change roster" })).toBeVisible();
  await picker.locator("button").filter({ hasText: "Beta FC" }).click();

  await expect(page.getByRole("button", { name: /Last used Beta FC Local 4 players/ })).toBeVisible();
});

test("an unsupported persisted locale falls back to complete English UI", async ({ page }) => {
  await page.addInitScript(({ localeKey }) => {
    window.localStorage.setItem(localeKey, "unsupported-test-locale");
  }, { localeKey: uiLocaleStorageKey });
  await seedLocalApp(page);

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Hey," })).toBeVisible();
  await expect(page.getByText("Choose your roster.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Change roster/ }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("heading", { name: "Change roster" })).toBeVisible();
  await picker.locator("button").filter({ hasText: "Alpha FC" }).click();

  await enterActiveRoster(page);
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("tab", { name: "Roster", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("tab", { name: "Teams", exact: true })).toBeVisible();
  const clubTab = sidebar.getByRole("tab", { name: "Club", exact: true });
  await expect(clubTab).toBeVisible();
  await clubTab.click();
  await expect(page.getByText("Club Access", { exact: true })).toBeVisible();

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(
    /\b(?:app|common|navigation|roster|today|teams|club|actionBoard|equipment|cabinet|auth|onboarding)\.[a-z][A-Za-z0-9_.-]*/,
  );
});

test("a cached shared workspace remains fail-closed while signed out", async ({ page }) => {
  await seedLocalApp(page, signedOutSharedRoster.id, [signedOutSharedRoster]);
  await enterActiveRoster(page, "Shared Smoke FC");

  await page.locator("aside").getByRole("tab", { name: "Club", exact: true }).click();

  await expect(page.getByText("Club Access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("Sign in to check this shared workspace.", { exact: true }).first()).toBeVisible();
});

test("a representative local attendance can generate two complete teams", async ({ page }) => {
  await seedLocalApp(page);
  await enterActiveRoster(page);

  await page.getByTestId("desktop-team-count").selectOption("2");
  await page.getByTestId("desktop-generate-teams").click();

  await expect(page.locator('[data-testid^="card-team-"]')).toHaveCount(2);
  for (let index = 0; index < playerNames.length; index += 1) {
    await expect(page.locator(`[data-testid^="player-row-smoke-player-${index + 1}-team-"]`)).toHaveCount(1);
  }
});

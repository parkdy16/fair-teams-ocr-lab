import { expect, test } from "@playwright/test";

import {
  auditEmptyRoster,
  auditFootballRoster,
  auditSharedRoster,
  createLongContentRoster,
  enterAuditRoster,
  installAuditNetworkGuard,
  openRosterSettings,
  runAuditScenario,
  seedAuditApp,
  visibleAuditLocator,
  type AuditScenarioDefinition,
} from "./audit-fixtures.ts";

const scenarios = {
  workspaceChooser: {
    id: "workspace-chooser",
    order: 10,
    title: "Workspace chooser",
    goal: "Assess first-impression hierarchy, roster recognition and clarity of the next action.",
    task: "Open Stripes with deterministic local rosters available.",
  },
  rosterOverview: {
    id: "roster-overview",
    order: 20,
    title: "Populated roster overview",
    goal: "Audit frequent actions, player scanning, information density and Roster-page hierarchy.",
    task: "Open a representative 16-player recreational football roster.",
  },
  rosterSettings: {
    id: "roster-settings",
    order: 30,
    title: "Roster settings and file tools",
    goal: "Assess prioritization of infrequent roster, backup, sharing and setup actions.",
    task: "Open Settings from a populated local roster.",
  },
  addPlayerOptions: {
    id: "add-player-options",
    order: 40,
    title: "Add-player choices",
    goal: "Assess whether the primary player-acquisition paths are understandable and appropriately prioritized.",
    task: "Open Add Player options from the populated roster.",
  },
  addPlayerManual: {
    id: "add-player-manual",
    order: 50,
    title: "Manual add-player form",
    goal: "Audit form hierarchy, default simplicity and progressive disclosure for new-player creation.",
    task: "Open the manual Add Player form without entering data.",
  },
  playerEdit: {
    id: "player-edit-default",
    order: 60,
    title: "Player Setup dialog",
    goal: "Establish the production baseline for individual player rating and editing.",
    task: "Open an existing player's setup dialog.",
  },
  playerEditAdvanced: {
    id: "player-edit-advanced",
    order: 70,
    title: "Player Setup advanced details",
    goal: "Audit optional detailed-rating controls and whether advanced complexity remains secondary.",
    task: "Open Advanced Edit for an existing player.",
  },
  teamsSetup: {
    id: "teams-setup",
    order: 80,
    title: "Teams setup",
    goal: "Audit player selection, session controls and prominence of Generate.",
    task: "Open Teams before generation with the representative roster attending.",
  },
  teamsResults: {
    id: "teams-results",
    order: 90,
    title: "Generated teams",
    goal: "Audit result readability, team identity, balance communication and manual-adjustment affordances.",
    task: "Generate two teams from the deterministic roster.",
  },
  emptyRoster: {
    id: "empty-roster",
    order: 100,
    title: "Empty roster",
    goal: "Assess whether a new or empty roster clearly guides the organizer toward the first useful action.",
    task: "Open an empty local roster.",
  },
  longContent: {
    id: "long-content-stress",
    order: 110,
    title: "Long-content stress state",
    goal: "Reveal truncation, overflow, density and touch-target problems under realistic worst-case content.",
    task: "Open a 30-player roster with long names and a long roster title.",
  },
  sharedSignedOut: {
    id: "shared-signed-out-club",
    order: 120,
    title: "Signed-out shared workspace",
    goal: "Audit fail-closed shared-workspace messaging without letting a rare state dominate the main product.",
    task: "Open Club for a cached shared roster while signed out.",
  },
} satisfies Record<string, AuditScenarioDefinition>;

async function openTeams(page: Parameters<typeof enterAuditRoster>[0]) {
  const teamsTab = await visibleAuditLocator(
    page.getByRole("tab", { name: "Teams", exact: true }),
    "Teams navigation tab",
  );
  await teamsTab.click();
  await expect(teamsTab).toHaveAttribute("data-state", "active");
}

async function openClub(page: Parameters<typeof enterAuditRoster>[0]) {
  const clubTab = await visibleAuditLocator(
    page.getByRole("tab", { name: "Club", exact: true }),
    "Club navigation tab",
  );
  await clubTab.click();
  await expect(clubTab).toHaveAttribute("data-state", "active");
}

async function clickGenerate(page: Parameters<typeof enterAuditRoster>[0]) {
  const desktopGenerate = page.getByTestId("desktop-generate-teams");
  if (await desktopGenerate.isVisible().catch(() => false)) {
    await desktopGenerate.click();
    return;
  }

  const mobileGenerate = page.getByTestId("session-generate-teams");
  if (await mobileGenerate.isVisible().catch(() => false)) {
    await mobileGenerate.click();
    return;
  }

  throw new Error("No visible Generate button was found for this viewport.");
}

test.beforeEach(async ({ context }) => {
  await installAuditNetworkGuard(context);
});

test("01 workspace chooser", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.workspaceChooser, async () => {
    await seedAuditApp(page);
    await expect(page.getByText("Choose your roster.", { exact: true })).toBeVisible();
  });
});

test("02 populated roster overview", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.rosterOverview, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(
      auditFootballRoster.players.length,
    );
  });
});

test("03 roster settings", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.rosterSettings, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openRosterSettings(page);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test("04 add-player options", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.addPlayerOptions, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await page.getByTestId("button-open-add-options").click();
    await expect(page.getByTestId("button-add-manually-option")).toBeVisible();
  });
});

test("05 manual add-player form", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.addPlayerManual, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await page.getByTestId("button-open-add-options").click();
    await page.getByTestId("button-add-manually-option").click();
    await expect(page.getByTestId("input-player-name")).toBeVisible();
  });
});

test("06 player setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.playerEdit, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await page.getByTestId("profile-audit-player-1").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("input-player-quick-skill-audit-player-1")).toBeVisible();
  });
});

test("07 player setup advanced", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.playerEditAdvanced, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await page.getByTestId("profile-audit-player-1").click();
    await page.getByTestId("button-toggle-edit-advanced-audit-player-1").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test("08 teams setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.teamsSetup, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openTeams(page);
  });
});

test("09 generated teams", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.teamsResults, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openTeams(page);
    await clickGenerate(page);
    await expect(page.locator('[data-testid^="card-team-"]')).toHaveCount(2);
  });
});

test("10 empty roster", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.emptyRoster, async () => {
    await seedAuditApp(page, auditEmptyRoster.id, [auditEmptyRoster]);
    await enterAuditRoster(page, auditEmptyRoster.name);
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(0);
  });
});

test("11 long content stress", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.longContent, async () => {
    const roster = createLongContentRoster();
    await seedAuditApp(page, roster.id, [roster]);
    await enterAuditRoster(page, roster.name);
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(roster.players.length);
  });
});

test("12 signed-out shared workspace", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.sharedSignedOut, async () => {
    await seedAuditApp(page, auditSharedRoster.id, [auditSharedRoster]);
    await enterAuditRoster(page, auditSharedRoster.name);
    await openClub(page);
    await expect(page.getByText("Club Access", { exact: true })).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";

import {
  auditEmptyRoster,
  auditFootballRoster,
  auditSharedRoster,
  activateAuditControl,
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
    goal: "Assess first-impression hierarchy, roster recognition and the clarity of the next action.",
    task: "Open Stripes with several deterministic local rosters available.",
  },
  rosterOverview: {
    id: "roster-overview",
    order: 20,
    title: "Populated roster overview",
    goal: "Audit frequent actions, information density, player scanning and Roster-page hierarchy.",
    task: "Open a representative 16-player recreational football roster.",
  },
  rosterSettings: {
    id: "roster-settings",
    order: 30,
    title: "Roster settings and file tools",
    goal: "Assess whether infrequent setup and data-management actions are grouped and prioritized correctly.",
    task: "Open Settings from a populated local roster.",
  },
  newRosterSetup: {
    id: "new-roster-setup",
    order: 40,
    title: "Current new-roster setup",
    goal: "Audit setup choices, icon meaning, progressive disclosure and cognitive load.",
    task: "Open the experimental Create roster surface before making a selection.",
  },
  customAttributeSetup: {
    id: "custom-attribute-setup",
    order: 50,
    title: "Custom attributes inside roster creation",
    goal: "Inspect the current nested configuration experience and the clarity of choosing three or six qualities.",
    task: "Choose Custom sport or game and open its attribute editor.",
  },
  ratingSetupManager: {
    id: "rating-setup-manager",
    order: 60,
    title: "Current Player Model manager",
    goal: "Assess terminology, density and whether advanced management actions dominate normal setup.",
    task: "Open Player Model from the Roster page.",
  },
  presetEditor: {
    id: "preset-editor",
    order: 70,
    title: "Preset editor",
    goal: "Audit name, icon, radar and profile-shape controls for comprehensibility and visual feedback.",
    task: "Open Create preset from the current Player Model manager.",
  },
  playerEdit: {
    id: "player-edit-default",
    order: 80,
    title: "Existing Player Setup dialog",
    goal: "Assess the mature player-edit shell before integrating the edge preset interaction into it.",
    task: "Open an individual player from the populated roster.",
  },
  playerEditPreset: {
    id: "player-edit-after-preset",
    order: 90,
    title: "Player Setup after choosing a preset",
    goal: "Verify whether the selected preset is understandable and whether its graph feedback is visible soon enough.",
    task: "Choose Goal Threat in Player Setup without opening Advanced Edit.",
  },
  batchRating: {
    id: "experimental-batch-rating",
    order: 100,
    title: "Experimental batch-rating surface",
    goal: "Compare the separate rating UI against the existing Player Setup dialog and inspect the edge rail styling.",
    task: "Open Rate Players for the representative football roster.",
  },
  teamsSetup: {
    id: "teams-setup",
    order: 110,
    title: "Teams setup",
    goal: "Audit team-generation controls, configuration density and the prominence of Generate.",
    task: "Open Teams before generation with all representative players attending.",
  },
  teamsResults: {
    id: "teams-results",
    order: 120,
    title: "Generated team results",
    goal: "Audit result readability, balance communication and manual-correction affordances.",
    task: "Generate two teams from the deterministic football roster.",
  },
  emptyRoster: {
    id: "empty-roster",
    order: 130,
    title: "Empty custom roster",
    goal: "Assess onboarding, empty-state guidance and whether OVR-only simplicity is preserved.",
    task: "Open an empty custom activity roster with undefined placeholder qualities.",
  },
  longContent: {
    id: "long-content-stress",
    order: 140,
    title: "Long-content stress state",
    goal: "Reveal truncation, overflow, density and touch-target problems under realistic worst-case content.",
    task: "Open a 30-player roster with long names, a long roster title and twelve presets.",
  },
  sharedSignedOut: {
    id: "shared-signed-out-club",
    order: 150,
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
  const generateCandidates = page.getByRole("button", { name: /generate/i });
  for (let index = (await generateCandidates.count()) - 1; index >= 0; index -= 1) {
    const candidate = generateCandidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
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
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(auditFootballRoster.players.length);
  });
});

test("03 roster settings", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.rosterSettings, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openRosterSettings(page);
    await expect(page.getByTestId("open-new-roster-setup")).toBeVisible();
  });
});

test("04 new roster setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.newRosterSetup, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openRosterSettings(page);
    await page.getByTestId("open-new-roster-setup").click();
    await expect(page.getByTestId("new-roster-setup")).toBeVisible();
  });
});

test("05 custom attribute setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.customAttributeSetup, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openRosterSettings(page);
    await page.getByTestId("open-new-roster-setup").click();
    const setup = page.getByTestId("new-roster-setup");
    await setup.getByTestId("new-roster-mode-custom").click();
    await setup.getByTestId("customize-new-roster-model").click();
    await expect(page.getByTestId("player-model-settings")).toBeVisible();
  });
});

test("06 current rating setup manager", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.ratingSetupManager, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await activateAuditControl(
      page.getByTestId("button-player-model-settings"),
      "Player Model entry point",
      { allowHiddenFallback: true },
    );
    await expect(page.getByTestId("player-model-settings")).toBeVisible();
  });
});

test("07 preset editor", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.presetEditor, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await activateAuditControl(
      page.getByTestId("button-player-model-settings"),
      "Player Model entry point",
      { allowHiddenFallback: true },
    );
    const modelSettings = page.getByTestId("player-model-settings");
    await modelSettings.getByRole("button", { name: "Create preset", exact: true }).click();
    await expect(page.getByTestId("preset-editor")).toBeVisible();
  });
});

test("08 existing player setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.playerEdit, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await activateAuditControl(
      page.getByTestId("profile-audit-player-1"),
      "player edit entry point",
      { allowHiddenFallback: true },
    );
    await expect(page.getByRole("heading", { name: "Player Setup" })).toBeVisible();
  });
});

test("09 player setup after preset", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.playerEditPreset, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await activateAuditControl(
      page.getByTestId("profile-audit-player-1"),
      "player edit entry point",
      { allowHiddenFallback: true },
    );
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("player-preset-goal-threat").click();
    await expect(dialog.getByTestId("player-preset-goal-threat")).toHaveAttribute("aria-pressed", "true");
  });
});

test("10 experimental batch rating", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.batchRating, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await activateAuditControl(
      page.getByTestId("button-rate-players"),
      "Rate Players entry point",
      { allowHiddenFallback: true },
    );
    await expect(page.getByTestId("player-batch-rating-flow")).toBeVisible();
  });
});

test("11 teams setup", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.teamsSetup, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openTeams(page);
  });
});

test("12 generated teams", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.teamsResults, async () => {
    await seedAuditApp(page);
    await enterAuditRoster(page);
    await openTeams(page);
    await clickGenerate(page);
    await expect(page.locator('[data-testid^="card-team-"]')).toHaveCount(2);
  });
});

test("13 empty custom roster", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.emptyRoster, async () => {
    await seedAuditApp(page, auditEmptyRoster.id, [auditEmptyRoster]);
    await enterAuditRoster(page, auditEmptyRoster.name);
  });
});

test("14 long content stress", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.longContent, async () => {
    const roster = createLongContentRoster();
    await seedAuditApp(page, roster.id, [roster]);
    await enterAuditRoster(page, roster.name);
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(roster.players.length);
  });
});

test("15 signed-out shared workspace", async ({ page, context }, testInfo) => {
  await runAuditScenario({ page, context }, testInfo, scenarios.sharedSignedOut, async () => {
    await seedAuditApp(page, auditSharedRoster.id, [auditSharedRoster]);
    await enterAuditRoster(page, auditSharedRoster.name);
    await openClub(page);
    await expect(page.getByText("Club Access", { exact: true })).toBeVisible();
  });
});

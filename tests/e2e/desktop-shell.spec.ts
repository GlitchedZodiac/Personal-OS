import { expect, test, type Page } from "@playwright/test";

async function unlockIfNeeded(page: Page) {
  const appPin = process.env.PLAYWRIGHT_APP_PIN || process.env.APP_PIN;

  if (await page.getByText("Personal OS").first().isVisible().catch(() => false)) {
    test.skip(!appPin, "APP_PIN or PLAYWRIGHT_APP_PIN is required for UI tests.");
    await page.locator('input[type="password"]').fill(appPin!);
    await page.getByRole("button", { name: /unlock|entrar/i }).click();
  }
}

test("desktop dashboard exposes the workspace hub", async ({ page }) => {
  await page.goto("/");
  await unlockIfNeeded(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: /dashboard/i }).first()).toBeVisible();
  await expect(page.getByText("Finance")).toBeVisible();
});

test("finance routes render inbox and reports surfaces", async ({ page }) => {
  await page.goto("/finances/inbox");
  await unlockIfNeeded(page);
  await expect(page.getByRole("heading", { name: "Finance Inbox" })).toBeVisible();

  await page.goto("/finances/reports");
  await expect(page.getByRole("heading", { name: "Finance Reports" })).toBeVisible();
});

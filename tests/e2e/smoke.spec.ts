import { expect, test } from "@playwright/test";

test("@smoke login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /sign in to your account/i })
  ).toBeVisible();
});

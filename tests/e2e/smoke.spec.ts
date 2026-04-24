import { expect, test } from "@playwright/test";

test("@smoke login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
  await expect(page.getByText("Sign in to your account to continue")).toBeVisible();
});

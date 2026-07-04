import { expect, test } from "@playwright/test";

test("@smoke login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
  await expect(page.getByText("Sign in to your account to continue")).toBeVisible();
});

test("@smoke login link renders the login page without refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^log in$/i }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
});

test("@smoke protected routes render login after redirect without refresh", async ({
  page,
}) => {
  await page.goto("/dashboard/settings");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /welcome back/i })
  ).toBeVisible();
});

[
  "/templates",
  "/pricing",
  "/features",
  "/categories/outdoor",
].forEach((startPath) => {
  test(`@smoke login link renders from ${startPath} without refresh`, async ({
    page,
  }) => {
    await page.goto(startPath);
    await page.getByRole("link", { name: /^log in$/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible();
  });
});

test("@smoke login password visibility toggles", async ({ page }) => {
  await page.goto("/login");

  const password = page.locator("#password");

  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("@smoke register password visibility toggles", async ({ page }) => {
  await page.goto("/register");

  const password = page.locator("#password");
  const confirmPassword = page.locator("#confirmPassword");

  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmPassword).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await page.getByRole("button", { name: "Show confirm password" }).click();

  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmPassword).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Hide confirm password" }).click();

  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmPassword).toHaveAttribute("type", "password");
});

import { expect, test, type Page } from "@playwright/test";

import { apiJson } from "./support/api-requests";
import { reportBillingEnabled } from "./support/billing";

const PASSWORD = "Aa!template-limit-password-12345";
const LIMIT_MESSAGE = "Template limit reached. Upgrade to create more templates.";
const CHECKOUT_RETURN_PATH = "/account";
const BILLING_SETTINGS_URL = /\/dashboard\/settings/;

async function registerFreeAccount(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/register/");
  await page.getByLabel("Name").fill("Template Limit QA");
  await page.getByLabel("Email").fill(`template-limit+${suffix}@e2e.local`);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirmPassword").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Switch context" })).toBeVisible({
    timeout: 30_000,
  });
}

async function createTemplateViaApi(page: Page, title: string): Promise<string> {
  const template = await apiJson<{ id: string }>(page, "/templates", {
    method: "POST",
    body: { title, is_public: false, sections: [] },
  });
  return template.id;
}

async function answerCheckoutWithTheBillingPage(page: Page): Promise<{ requests: number }> {
  const checkout = { requests: 0 };
  await page.route("**/api/billing/checkout", async (route) => {
    checkout.requests += 1;
    await route.fulfill({ json: { url: CHECKOUT_RETURN_PATH } });
  });
  await reportBillingEnabled(page);
  return checkout;
}

async function waitUntilTheEditorHasCountedTheTemplates(page: Page) {
  await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible();
}

test.describe("template limit upgrade path", () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
  });

  test("offers the upgrade in the editor in one message, and keeps the draft across checkout", async ({ page }) => {
    await registerFreeAccount(page);
    await createTemplateViaApi(page, "First template");
    const checkout = await answerCheckoutWithTheBillingPage(page);

    await page.goto("/dashboard/templates/new/");
    await waitUntilTheEditorHasCountedTheTemplates(page);

    await page.getByPlaceholder("Enter template name...").fill("Second template");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
    await expect(page.getByText(LIMIT_MESSAGE)).toHaveCount(1);
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();

    await expect(page).toHaveURL(BILLING_SETTINGS_URL);
    expect(checkout.requests).toBe(1);
    await page.getByRole("link", { name: "Resume template draft" }).click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);
    await page.getByRole("button", { name: "Restore draft" }).click();
    await expect(page.getByPlaceholder("Enter template name...")).toHaveValue("Second template");
  });

  test("Restore draft asks before replacing a template typed since", async ({ page }) => {
    await registerFreeAccount(page);
    await createTemplateViaApi(page, "First template");
    await answerCheckoutWithTheBillingPage(page);

    await page.goto("/dashboard/templates/new/");
    await waitUntilTheEditorHasCountedTheTemplates(page);
    const title = page.getByPlaceholder("Enter template name...");
    await title.fill("Second template");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(LIMIT_MESSAGE)).toHaveCount(1);
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL(BILLING_SETTINGS_URL);
    await page.getByRole("link", { name: "Resume template draft" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);

    await title.fill("Another template");
    let confirmMessage: string | null = null;
    page.once("dialog", async (dialog) => {
      confirmMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Restore draft" }).click();

    await expect.poll(() => confirmMessage).toContain("kept draft");
    await expect(title).toHaveValue("Another template");
    await expect(page.getByRole("button", { name: "Restore draft" })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Restore draft" }).click();
    await expect(title).toHaveValue("Second template");
  });

  test("Duplicate on a template offers the upgrade", async ({ page }) => {
    await registerFreeAccount(page);
    const templateId = await createTemplateViaApi(page, "Only template");
    const checkout = await answerCheckoutWithTheBillingPage(page);

    await page.goto(`/dashboard/templates/${templateId}/`);
    await page.getByRole("button", { name: "Template actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    await expect(page).toHaveURL(BILLING_SETTINGS_URL);
    expect(checkout.requests).toBe(1);
  });
});

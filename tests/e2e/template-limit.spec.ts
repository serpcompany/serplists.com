import { expect, test, type Page } from "@playwright/test";

import { dismissTheNextConfirm } from "./support/navigation";
import { apiJson } from "./support/api-requests";
import { reportBillingEnabled, TEMPLATE_LIMIT_MESSAGE } from "./support/billing";
import { registerNewAccount, uniqueSuffix } from "./support/sign-in";

const PASSWORD = "Aa!template-limit-password-12345";
const CHECKOUT_RETURN_PATH = "/account";
const BILLING_SETTINGS_URL = /\/dashboard\/settings/;

async function registerFreeAccount(page: Page) {
  await registerNewAccount(page, {
    name: "Template Limit QA",
    email: `template-limit+${uniqueSuffix()}@e2e.local`,
    password: PASSWORD,
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
  await expect(page.getByText(TEMPLATE_LIMIT_MESSAGE)).toBeVisible();
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
    await expect(page.getByText(TEMPLATE_LIMIT_MESSAGE)).toHaveCount(1);
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
    await expect(page.getByText(TEMPLATE_LIMIT_MESSAGE)).toHaveCount(1);
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL(BILLING_SETTINGS_URL);
    await page.getByRole("link", { name: "Resume template draft" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates\/new\/$/);

    await title.fill("Another template");
    const confirmMessage = dismissTheNextConfirm(page);
    await page.getByRole("button", { name: "Restore draft" }).click();

    await expect.poll(confirmMessage).toContain("kept draft");
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

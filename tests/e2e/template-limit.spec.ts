import { expect, test, type Page } from "@playwright/test";

const DEV_API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8788/api";
const PASSWORD = "Aa!template-limit-password-12345";
const LIMIT_MESSAGE = "Template limit reached. Upgrade to create more templates.";

// A new account is Free with no templates; Free Personal allows one template.
async function registerFreeAccount(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/register");
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
  return page.evaluate(async ({ templateTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: templateTitle, is_public: false, sections: [] }),
    });
    if (!response.ok) throw new Error(`Failed to create template: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { templateTitle: title, apiBaseUrl: DEV_API_BASE_URL });
}

// Checkout would leave for Stripe; answer it with the billing page instead, and report
// billing as enabled so the Upgrade action is offered even without Stripe keys.
async function stubCheckout(page: Page): Promise<{ requests: number }> {
  const checkout = { requests: 0 };
  await page.route("**/api/billing/checkout", async (route) => {
    checkout.requests += 1;
    await route.fulfill({ json: { url: "/account" } });
  });
  await page.route("**/api/billing/status**", async (route) => {
    const response = await route.fetch();
    const status = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...status, billingEnabled: true } });
  });
  return checkout;
}

test.describe("template limit upgrade path", () => {
  test("offers the upgrade in the editor and keeps the draft across checkout", async ({ page }) => {
    await registerFreeAccount(page);
    await createTemplateViaApi(page, "First template");
    const checkout = await stubCheckout(page);

    await page.goto("/dashboard/templates/new");
    // Warned before writing a template the plan cannot save.
    await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible();

    await page.getByPlaceholder("Enter template name...").fill("Second template");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/new$/);
    // One message, with its action, not an error alert plus a toast.
    await expect(page.getByText(LIMIT_MESSAGE)).toHaveCount(1);
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();

    // /account, the checkout return, redirects to settings, which holds the billing section.
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    expect(checkout.requests).toBe(1);
    await page.getByRole("link", { name: "Resume template draft" }).click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/new$/);
    await page.getByRole("button", { name: "Restore draft" }).click();
    await expect(page.getByPlaceholder("Enter template name...")).toHaveValue("Second template");
  });

  // Restore draft replaces the whole form, so a template typed since needs a yes first.
  test("Restore draft asks before replacing a template typed since", async ({ page }) => {
    await registerFreeAccount(page);
    await createTemplateViaApi(page, "First template");
    await stubCheckout(page);

    await page.goto("/dashboard/templates/new");
    const title = page.getByPlaceholder("Enter template name...");
    await title.fill("Second template");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(LIMIT_MESSAGE)).toHaveCount(1);
    await page.getByRole("button", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await page.getByRole("link", { name: "Resume template draft" }).click();
    await expect(page).toHaveURL(/\/dashboard\/templates\/new$/);

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
    const checkout = await stubCheckout(page);

    await page.goto(`/dashboard/templates/${templateId}`);
    await page.getByRole("button", { name: "Template actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    // /account, the checkout return, redirects to settings, which holds the billing section.
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    expect(checkout.requests).toBe(1);
  });
});

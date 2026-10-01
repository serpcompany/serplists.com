import type { Page } from '@playwright/test';
import { z } from 'zod';

const RUN_LIMIT_MESSAGE = 'Active run limit reached. Upgrade to Pro to create more checklist runs.';
export const TEMPLATE_LIMIT_MESSAGE = 'Template limit reached. Upgrade to create more templates.';

const billingStatusSchema = z.record(z.unknown());

export async function reportBillingEnabled(page: Page) {
  await page.route('**/api/billing/status**', async (route) => {
    const response = await route.fetch();
    const status = billingStatusSchema.parse(await response.json());
    await route.fulfill({ response, json: { ...status, billingEnabled: true } });
  });
}

export async function answerRunStartsAtActiveRunLimit(page: Page) {
  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ code: 'limit_reached', error: RUN_LIMIT_MESSAGE }),
      contentType: 'application/json',
      status: 403,
    });
  });
}

export async function countCheckoutsSentTo(page: Page, url: string) {
  const checkout = { requests: 0 };
  await page.route('**/api/billing/checkout', async (route) => {
    checkout.requests += 1;
    await route.fulfill({ body: JSON.stringify({ url }), contentType: 'application/json', status: 200 });
  });
  return checkout;
}

export async function reportTheProPlan(page: Page) {
  await page.route('**/api/billing/status**', (route) =>
    route.fulfill({
      body: JSON.stringify({ billingEnabled: true, plan: 'pro' }),
      contentType: 'application/json',
      status: 200,
    }),
  );
}

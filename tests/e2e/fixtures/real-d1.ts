import { test as base, expect, type Page } from '@playwright/test';
import { recordRouteVisit } from '../../../scripts/data/route-coverage-evidence.mjs';
const endpoint = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const browserErrors = new WeakMap<Page, Set<string>>();
const personas = new WeakMap<Page, string>();
const assertPageHealthy = (page: Page) => expect([...(browserErrors.get(page) ?? [])], 'Browser/API errors').toEqual([]);
const test = base.extend({
  page: async ({ page, context }, providePage) => {
    // Disable interception at both levels, including accidental future helpers.
    const forbidden = () => { throw new Error('Real D1 coverage forbids API interception'); };
    page.route = forbidden;
    context.route = forbidden;
    page.routeFromHAR = forbidden;
    context.routeFromHAR = forbidden;
    const errors = new Set<string>();
    browserErrors.set(page, errors);
    const record = (message: string) => { if (errors.size < 20) errors.add(message); };
    page.on('pageerror', error => record(`exception: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') record(`console: ${message.text()}`); });
    page.on('response', response => { if (response.status() >= 500 || (response.url().startsWith(endpoint) && response.status() >= 400)) record(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    page.on('requestfailed', request => { if (request.url().startsWith(endpoint)) record(`failed API: ${new URL(request.url()).pathname}`); });
    await providePage(page);
    if (process.env.PLAYWRIGHT_ROUTE_NEGATIVE !== '1') assertPageHealthy(page);
  },
});
test.use({ serviceWorkers: 'block' });

async function get(page: Page, path: string) {
  const result = await page.evaluate(async url => {
    const response = await fetch(url, { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  }, `${endpoint}${path}`);
  expect(result.status, path).toBe(200);
  return result.body;
}

async function visit(page: Page, path: string, text: string) {
  await page.goto(path);
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Something went wrong|Failed to load|Error loading/i).first()).not.toBeVisible();
  await page.waitForLoadState('networkidle');
  assertPageHealthy(page);
  recordRouteVisit(path, personas.get(page) ?? 'anonymous');
}

async function login(page: Page, role = 'owner') {
  await page.goto('/login');
  await page.locator('#email').fill(`coverage-${role}@e2e.local`);
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.getByRole('button', { name: 'Switch workspace' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  personas.set(page, role);
}

export { test, expect, endpoint, assertPageHealthy, get, visit, login };

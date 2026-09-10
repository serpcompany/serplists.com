import { recordIntegrationScenario } from '../../scripts/data/data-regression-report-lib.mjs';
import { test, expect, endpoint, assertPageHealthy, get, visit, login } from './fixtures/real-d1';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { discoverRouteSurfaces, discoverRoutePatterns, validateRouteInventory } from '../../scripts/data/route-coverage-lib.mjs';
import { recordRouteScenarios } from '../../scripts/data/route-coverage-evidence.mjs';
import { writeDataCheckReports } from '../../scripts/data/reporting.mjs';
const inventory = JSON.parse(readFileSync('scripts/data/route-coverage-inventory.json', 'utf8'));

test.describe('real local database routes', () => {
  test.setTimeout(120_000);
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE === '1');
    expect(process.env.PLAYWRIGHT_USE_DEV_VARS).toBe('0');
    expect(validateRouteInventory(discoverRouteSurfaces(process.cwd()), inventory, discoverRoutePatterns(process.cwd()))).toEqual([]);
  });

  test('@real-d1 public profile, template, shared run and static pages', async ({ page }) => {
    await visit(page, '/profile/coverage-owner', 'Coverage Owner');
    await expect(page.getByText('Coverage Public Template').first()).toBeVisible();
    expect((await get(page, '/profiles/by-id?userId=coverage-owner')).id).toBe('coverage-owner');
    const templates = await get(page, '/templates/public?userId=coverage-owner');
    expect(templates.map((row: { id: string }) => row.id)).toEqual(['coverage-public']);
    await visit(page, '/profile/coverage-owner/coverage-public', 'Coverage Public Template');
    let sharedRunReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/checklists/shared/coverage-share') sharedRunReads++;
    });
    await visit(page, '/share/coverage-share', 'Coverage Run');
    await page.waitForTimeout(300);
    expect(sharedRunReads).toBeGreaterThan(0);
    expect(sharedRunReads).toBeLessThanOrEqual(2);
    console.log('real local D1 shared run loading requests:', sharedRunReads);
    expect((await get(page, '/checklists/shared/coverage-share')).id).toBe('coverage-run');
    recordRouteScenarios(['public-content']);
    await visit(page, '/team-invites/coverage-pending', 'Log in to accept');
    await visit(page, '/features/template-builder', 'Template');
    for (const [path, text] of [['/', 'checklist'], ['/templates', 'Templates'], ['/categories', 'Categories'], ['/categories/business', 'Business'], ['/features', 'Features'], ['/pricing', 'Free'], ['/about', 'About'], ['/contact', 'Contact'], ['/login', 'Sign in'], ['/register', 'Create account'], ['/forgot-password', 'password'], ['/reset-password', 'password']]) await visit(page, path, text);
    recordRouteScenarios(['public-static-pages']);
  });

  test('@real-d1 owned templates, runs, editor and settings stay populated', async ({ page, context }) => {
    await login(page);
    expect((await get(page, '/templates')).map((row: { id: string }) => row.id)).toContain('coverage-private');
    expect((await get(page, '/checklists')).map((row: { id: string }) => row.id)).toContain('coverage-run');
    expect((await get(page, '/billing/status')).plan).toBe('pro');
    for (const [path, text] of [['/dashboard/templates', 'Coverage Private Template'], ['/dashboard/templates/coverage-private', 'Coverage Private Template'], ['/dashboard/templates/coverage-private/edit', 'Coverage'], ['/dashboard/templates/new', 'Save'], ['/dashboard/import-templates', 'Import'], ['/dashboard/runs', 'Coverage Run'], ['/dashboard/runs/coverage-run', 'Coverage Run'], ['/run/coverage-run', 'Coverage Run'], ['/dashboard/settings', 'Profile']]) await visit(page, path, text);
    for (const path of ['/templates/archived', '/checklists/archived', '/templates/coverage-private/history', '/checklists/coverage-run/history', '/templates/backup']) await get(page, path);
    for (const name of ['Coverage Owner Updated', 'Coverage Owner']) {
      const response = await context.request.post(`${endpoint}/auth/update-user`, { headers: { Origin: new URL(page.url()).origin }, data: { name } });
      expect(response.status()).toBe(200);
      expect((await get(page, '/profiles/by-id?userId=coverage-owner')).full_name).toBe(name);
    }
    recordRouteScenarios(['owned-pages', 'template-run-read-branches', 'user-override-entitlement']);
  });

  for (const role of ['owner', 'admin', 'editor', 'runner', 'viewer']) {
    test(`@real-d1 team role ${role} reads real membership and entitlement records`, async ({ page, context }) => {
        await login(page, role);
        expect((await get(page, '/teams')).map((row: { id: string }) => row.id)).toContain('coverage-team');
        expect((await get(page, '/teams/coverage-team')).membership.role).toBe(role);
        expect((await get(page, '/teams/coverage-team/members')).length).toBe(5);
        expect((await get(page, '/billing/status?teamId=coverage-team')).plan).toBe('team');
        expect((await get(page, '/templates?teamId=coverage-team')).map((row: { id: string }) => row.id)).toContain('coverage-team-template');
        expect((await get(page, '/billing/status')).plan).toBe(role === 'owner' ? 'pro' : 'free');
        const rename = await context.request.put(`${endpoint}/teams/coverage-team`, { data: { name: `Coverage Team ${role}` } });
        expect(rename.status(), `team write permission: ${role}`).toBe(['owner', 'admin'].includes(role) ? 200 : 403);
      recordRouteScenarios([`team-role-reads-${role}`, ...(role === 'admin' ? ['free-entitlement', 'team-entitlement'] : [])], process.env, {role});
    });
  }

  test('@real-d1 legacy route aliases reach their real data destinations', async ({ page }) => {
    await visit(page, '/checklists', 'Templates');
    await login(page);
    for (const [path, text] of [['/console', 'Coverage Private Template'], ['/dashboard', 'Coverage Private Template'], ['/account', 'Profile'], ['/dashboard/profile', 'Profile'], ['/console/templates/coverage-private', 'Coverage Private Template'], ['/console/templates/coverage-private/edit', 'Coverage'], ['/console/runs/coverage-run', 'Coverage Run']]) await visit(page, path, text);
    recordRouteScenarios(['legacy-route-aliases']);
  });

});

test('missing column breaks the real consuming profile page', { tag: '@real-d1-negative' }, async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE !== '1');
  const response = page.waitForResponse(response => response.url().includes('/profiles/by-username'));
  await page.goto('/profile/coverage-owner');
  expect((await response).status()).toBe(500);
  await expect(page.getByText('Coverage Public Template', { exact: true })).not.toBeVisible();
  expect(() => assertPageHealthy(page), 'The positive suite detector must reject the real broken query').toThrow();
  const report = { verdict: 'pass', commit: process.env.DATA_REGRESSION_START_COMMIT, target: { environment: 'local', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: 'local:miniflare:DB@isolated-data-regression', synthetic: true }, migrationRange: { from: process.env.DATA_REGRESSION_MIGRATION_FROM, to: process.env.DATA_REGRESSION_MIGRATION_TO }, migrationLedger: JSON.parse(process.env.PLAYWRIGHT_ROUTE_LEDGER_JSON ?? '[]'), checks: [{ name: 'real missing column fails consuming page and normal detector', verdict: 'pass' }] };
  writeDataCheckReports({ name: 'route-coverage-negative', report, summary: 'Renaming users.username in disposable migrated local D1 produced HTTP500 on the qualified profile query and failed the positive browser error detector.', reportDirectory: dirname(process.env.PLAYWRIGHT_ROUTE_COVERAGE_PROOF ?? 'tmp/data-reports/route-coverage.json') });
  recordIntegrationScenario('browser-missing-column');
  });

test('the ordinary profile expectation rejects HTTP 200 with missing content', { tag: '@real-d1-false-empty' }, async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE !== 'false-empty');
  const response = page.waitForResponse(response => response.url().includes('/templates/public'));
  await page.goto('/profile/coverage-owner');
  const result = await response;
  expect(result.status()).toBe(200);
  expect(await result.json()).toEqual([]);
  await expect(expect(page.getByText('Coverage Public Template').first()).toBeVisible({ timeout: 1500 })).rejects.toThrow();
  recordIntegrationScenario('browser-false-empty');
});

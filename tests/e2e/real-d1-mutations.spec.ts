import type { BrowserContext } from '@playwright/test';
import { test, expect, endpoint, login, visit } from './fixtures/real-d1';
import { recordRouteScenarios } from '../../scripts/data/route-coverage-evidence.mjs';
import { readFileSync } from 'node:fs';
import { parseLegacySections } from '../../src/lib/schemas/legacyChecklistSchema';

const sections = [{ id: 'mutation-section', title: 'Mutation section', items: [{ id: 'mutation-item', title: 'Mutation item' }] }];
async function request(context: BrowserContext, method: string, path: string, data?: unknown, status = 200) {
  const response = await context.request.fetch(`${endpoint}${path}`, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  expect(response.status(), `${method} ${path}: ${JSON.stringify(body)}`).toBe(status);
  return body;
}

test.describe('real D1 writable query branches', () => {
  test.setTimeout(120_000);
  test.beforeEach(() => {
    test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE === '1');
    expect(process.env.PLAYWRIGHT_USE_DEV_VARS).toBe('0');
  });

  test('@real-d1 personal and team templates and runs survive versions, sharing, archives and imports', async ({ page, context }) => {
    await login(page);
    for (const teamId of [undefined, 'coverage-team']) {
      const scope = teamId ? `?teamId=${teamId}` : '';
      const title = teamId ? 'Mutation team template' : 'Mutation personal template';
      const template = await request(context, 'POST', '/templates', { title, sections, is_public: false, ...(teamId ? { teamId } : {}) });
      const initial = await request(context, 'GET', `/templates/${template.id}`);
      expect(initial.title).toBe(title);
      const run = await request(context, 'POST', '/checklists', { template_id: template.id, title: `${title} run`, ...(teamId ? { teamId } : {}) });
      await request(context, 'PUT', `/templates/${template.id}`, { title: `${title} updated`, sections: [...sections, { id: 'new-section', title: 'New content', items: [] }], expected_version: initial.version });
      await request(context, 'PUT', `/templates/${template.id}`, { title: 'Stale overwrite', expected_version: initial.version }, 409);
      const updated = await request(context, 'GET', `/templates/${template.id}`);
      expect(updated.title).toBe(`${title} updated`);
      expect((await request(context, 'GET', `/templates/${template.id}/history`)).versions.length).toBeGreaterThanOrEqual(2);
      const initialRun = await request(context, 'GET', `/checklists/${run.id}`);
      await request(context, 'POST', `/checklists/${run.id}/revalidate`, { expected_revision: initialRun.revision });
      const revalidated = await request(context, 'GET', `/checklists/${run.id}`);
      expect(revalidated.template_version).toBe(updated.version);
      await request(context, 'PUT', `/checklists/${run.id}`, { progress: 55, expected_revision: revalidated.revision });
      await request(context, 'PUT', `/checklists/${run.id}`, { progress: 99, expected_revision: revalidated.revision }, 409);
      expect((await request(context, 'GET', `/checklists/${run.id}`)).progress).toBe(55);
      expect((await request(context, 'GET', `/checklists/${run.id}/history`)).events.length).toBeGreaterThan(0);
      const share = await request(context, 'POST', `/checklists/run/${run.id}/share`, {});
      const shared = await request(context, 'GET', `/checklists/shared/${share.shareToken}`);
      await request(context, 'PUT', `/checklists/shared/${share.shareToken}`, { progress: 75, expected_revision: shared.revision });
      expect((await request(context, 'GET', `/checklists/${run.id}`)).progress).toBe(75);
      const templateShare = await request(context, 'POST', `/checklists/${template.id}/share`, {});
      expect((await request(context, 'GET', `/checklists/shared/${templateShare.shareToken}`)).id).toBe(templateShare.id);
      await request(context, 'DELETE', `/checklists/${templateShare.id}`);
      await request(context, 'DELETE', `/checklists/${run.id}`);
      expect((await request(context, 'GET', `/checklists/archived${scope}`)).some((row: { id: string }) => row.id === run.id)).toBe(true);
      await request(context, 'POST', `/checklists/${run.id}/restore`, {});
      expect((await request(context, 'GET', `/checklists/${run.id}`)).is_public).toBe(false);
      await request(context, 'DELETE', `/templates/${template.id}`);
      expect((await request(context, 'GET', `/templates/archived${scope}`)).some((row: { id: string }) => row.id === template.id)).toBe(true);
      await request(context, 'POST', `/templates/${template.id}/restore`, {});
      expect((await request(context, 'GET', `/templates${scope}`)).some((row: { id: string }) => row.id === template.id)).toBe(true);
      const clone = await request(context, 'POST', '/templates/coverage-public/clone', { visibility: 'private', ...(teamId ? { teamId } : {}) });
      expect((await request(context, 'GET', `/templates/${clone.id}`)).is_public).toBe(false);
      const imported = await request(context, 'POST', `/templates/backup${scope}`, { templates: [{ title: 'Mutation import', sections }], options: { visibility: 'private' } });
      expect(imported.imported).toBe(1);
      expect(imported.failed).toEqual([]);
      // Positive export is scoped to the valid records owned by this test.
      expect((await request(context, 'GET', `/templates/backup${scope}${scope ? '&' : '?'}format=backup`)).templates.some(row => row.id === imported.successes[0].id)).toBe(true);
      const sourceState = process.env.PLAYWRIGHT_REHEARSAL_STATE ? JSON.parse(readFileSync(process.env.PLAYWRIGHT_REHEARSAL_STATE, 'utf8')) : null;
      const invalidPublic = sourceState?.rows.templates.filter(row => row.is_public && row.deleted_at == null && !parseLegacySections(row.items).success) ?? [];
      const before = await Promise.all(invalidPublic.map(row => request(context, 'GET', `/templates/${row.id}`)));
      const publicExport = await request(context, 'GET', `/templates/backup${scope}${scope ? '&' : '?'}includePublic=1&format=backup`, undefined, invalidPublic.length ? 409 : 200);
      if (invalidPublic.length) {
        expect(publicExport.error).toContain('invalid content');
        expect(await Promise.all(invalidPublic.map(row => request(context, 'GET', `/templates/${row.id}`)))).toEqual(before);
      } else expect(publicExport.templates.length).toBeGreaterThan(0);
      for (const id of [template.id, clone.id, imported.successes[0].id]) await request(context, 'DELETE', `/templates/${id}`);
      await request(context, 'DELETE', `/checklists/${run.id}`);
    }
    recordRouteScenarios(['template-run-mutations']);
  });

});

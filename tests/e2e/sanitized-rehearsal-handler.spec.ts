import { test, expect, type BrowserContext } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseLegacySections, validRetiredChecklistContent } from '../../src/lib/schemas/legacyChecklistSchema';
import { sanitizedSourceRole } from '../../scripts/data/sanitized-state-lib.mjs';

const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
test('@smoke exact sanitized rows pass authenticated candidate template and run reads and writes', async ({ browser, baseURL }) => {
  test.skip(!process.env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL, 'Sanitized rehearsal artifact was not supplied.');
  test.setTimeout(600_000);
  const state = JSON.parse(readFileSync(process.env.PLAYWRIGHT_REHEARSAL_STATE!, 'utf8'));
  const manifest = JSON.parse(readFileSync(process.env.PLAYWRIGHT_SANITIZER_MANIFEST!, 'utf8'));
  expect(state.transformation.verdict).toBe('pass');
  expect(state.commit).toBe(process.env.DATA_REGRESSION_START_COMMIT);
  expect(state.sourceSha256).toBe(process.env.PLAYWRIGHT_SANITIZER_SHA256);
  expect(state.sourceProfile).toEqual(manifest.sourceProfile);
  expect(state.manifestIntegritySha256).toBe(manifest.manifestIntegritySha256);
  expect(state.cohort.principals.length).toBe(manifest.selection.selectedCounts.users);
  expect(state.cohort.teams.length).toBe(manifest.selection.selectedCounts.teams);
  expect(state.cohort.members.length).toBe(manifest.selection.selectedCounts.teamMembers);
  const sessions = new Map<string, BrowserContext>();
  const pages = new Map();
  const cases = [];
  const record = (kind, row, principal, action) => cases.push({ kind, id: row.id, principal, action, verdict: 'pass' });
  const measurements = { rowReads: 0, privateDenials: 0, roleWriteDenials: 0, templateWrites: 0, runWrites: 0 };
  const malformedSourceChecks = [], contexts = [], withheldRows = [];
  const request = async (principal: string, path: string, init?: { method?: string; data?: unknown }) => {
    const response = await sessions.get(principal)!.request.fetch(`${apiBaseUrl}${path}`, init);
    return { status: response.status(), body: await response.json() };
  };
  const roleFor = (row, principal) => sanitizedSourceRole(state, row, principal);
  const suffix = row => row.team_id == null ? '' : `?teamId=${encodeURIComponent(row.team_id)}`;
  const key = (endpoint, row) => `${endpoint}/${row.id}`;
  const read = async (principal, endpoint, row) => {
    const result = await request(principal, row.deleted_at == null ? `/${endpoint}/${row.id}` : `/${endpoint}/archived${suffix(row)}`);
    if (result.status === 200 && row.deleted_at != null) result.body = result.body.find(entry => entry.id === row.id);
    return result;
  };
  const valid = (kind, row) => parseLegacySections(row.items).success && (kind !== 'runs' || validRetiredChecklistContent(row.retired_items));
  const initial = new Map();
  const families = [['templates', 'templates', 3], ['runs', 'checklists', 2]] as const;
  let injectedPageFailure = false;
  const browserVisit = async (principal, kind, row, afterWrite = false) => {
    const page = pages.get(principal);
    const errors = [];
    const exception = error => errors.push(`exception: ${error.message}`);
    const consoleError = message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); };
    const failed = request => { if (request.url().startsWith(apiBaseUrl)) errors.push('failed API'); };
    const responseError = response => { if (response.url().startsWith(apiBaseUrl) && response.status() >= 400) errors.push(`HTTP ${response.status()}`); };
    page.on('pageerror', exception); page.on('console', consoleError); page.on('requestfailed', failed); page.on('response', responseError);
    try {
      await page.evaluate(workspace => localStorage.setItem('serplists.activeWorkspaceId', workspace), row.team_id ?? 'personal');
      const listPath = `/dashboard/${kind === 'templates' ? 'templates' : 'runs'}`;
      const detailPath = kind === 'templates' ? `${listPath}/${row.id}` : `/run/${row.id}`;
      if (process.env.PLAYWRIGHT_SANITIZED_PAGE_NEGATIVE === '1' && !injectedPageFailure) {
        expect(process.env.PLAYWRIGHT_USE_DEV_VARS).toBe('0');
        expect(process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO).toBeTruthy();
        expect(process.env.PLAYWRIGHT_WRANGLER_CWD).toBeTruthy();
        execFileSync('npx', ['wrangler', '--cwd', process.env.PLAYWRIGHT_WRANGLER_CWD!, 'd1', 'execute', 'serp-checklists-db', '--local', '--persist-to', process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO!, '--command', 'ALTER TABLE templates RENAME COLUMN title TO missing_title_negative_control'], { env: process.env, stdio: 'pipe' });
        injectedPageFailure = true;
      }
      await page.goto(listPath);
      const title = afterWrite && kind === 'templates' ? 'Sanitized Template Handler Verified' : row.title;
      await page.waitForLoadState('networkidle');
      expect(errors, 'Imported-row browser/API errors').toEqual([]);
      const parsed = parseLegacySections(row.items);
      if (parsed.success) await expect(page.locator(`a[href="${detailPath}"]`).first(), 'Imported source row must render in its real workspace collection').toBeVisible({ timeout: 30_000 });
      else await expect(page.getByRole('alert').filter({ hasText: `Some ${kind === 'templates' ? 'templates' : 'runs'} contain invalid content` })).toBeVisible();
      for (const excluded of state.rows[kind].filter(other => !roleFor(other, principal) && !(kind === 'templates' && other.is_public))) {
        const excludedPath = kind === 'templates' ? `/dashboard/templates/${excluded.id}` : `/run/${excluded.id}`;
        await expect(page.locator(`a[href="${excludedPath}"]`), 'Private imported rows must not leak into another principal workspace').toHaveCount(0);
      }
      await page.goto(detailPath);
      if (parsed.success) {
        await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        for (const section of parsed.data) for (const item of section.items) if (item.title) await expect(page.getByText(item.title, { exact: true }).first()).toBeVisible();
        if (kind === 'runs') {
          const tasks = parsed.data.flatMap(section => section.items);
          const completed = tasks.filter(item => item.isCompleted ?? item.completed ?? false).length;
          await expect(page.getByText(`${completed} / ${tasks.length} tasks`, { exact: true }).first()).toBeVisible();
        }
        if (kind === 'templates' && roleFor(row, principal) < 3) await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByText(/This checklist contains invalid content/).first()).toBeVisible();
        if (kind === 'templates' && roleFor(row, principal) >= 3) {
          await page.goto(`${detailPath}/edit`);
          await expect(page.getByText('Unable to load template', { exact: true })).toBeVisible();
        }
        await expect(page.getByRole('button', { name: /^(Save|Save template|Save changes|Save notes|Mark Complete)$/i })).toHaveCount(0);
      }
      await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Something went wrong|Failed to load|Error loading/i).first()).not.toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors, 'Imported-row browser/API errors').toEqual([]);
    } finally {
      page.off('pageerror', exception); page.off('console', consoleError); page.off('requestfailed', failed); page.off('response', responseError);
    }
  };
  try {
    for (const principal of state.cohort.principals) {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block' }); sessions.set(principal.id, context);
      const page = await context.newPage();
      const forbidden = () => { throw new Error('Sanitized source proof forbids API interception'); };
      context.route = forbidden; context.routeFromHAR = forbidden; page.route = forbidden; page.routeFromHAR = forbidden;
      pages.set(principal.id, page);
      await page.goto('/login');
      await page.locator('#email').fill(`${principal.id}@e2e.local`);
      await page.locator('#password').fill('password123');
      await page.getByRole('button', { name: /sign in|log in/i }).click();
      await expect(page.getByRole('button', { name: 'Switch workspace' })).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
    }
    // Complete immutable readback precedes every positive mutation.
    for (const [kind, endpoint, minimumWriteRole] of families) {
      expect(state.rows[kind].length).toBeGreaterThan(0);
      for (const row of state.rows[kind]) {
        const authorized = state.cohort.principals.filter(principal => roleFor(row, principal.id) > 0);
        const archivedTeam = state.cohort.teams.some(team => team.id === row.team_id && team.archived_at != null);
        const publicRead = kind === 'templates' && row.is_public && row.deleted_at == null;
        if (!authorized.length && archivedTeam && !publicRead) withheldRows.push({ kind, id: row.id, reason: 'archived-team-api-refusal', cohortSha256: state.cohortSha256 });
        else if (!publicRead) expect(authorized.length, 'Every imported row requires an actual authorized source principal or an explicit archived-team refusal').toBeGreaterThan(0);
        for (const principal of state.cohort.principals) {
          const role = roleFor(row, principal.id);
          if (!role && !publicRead) {
            const denied = await read(principal.id, endpoint, row);
            expect(denied.status === 403 || denied.status === 404 || (row.deleted_at != null && denied.status === 200 && denied.body == null), 'Private source rows must be isolated from other principals and teams').toBe(true);
            if (row.deleted_at == null) {
              const reader = authorized[0];
              const beforeRefusal = reader ? await read(reader.id, endpoint, row) : null;
              if (beforeRefusal) expect(beforeRefusal.status).toBe(200);
              const writeDenied = await request(principal.id, `/${endpoint}/${row.id}`, { method: 'PUT', data: kind === 'templates' ? { title: 'Forbidden source write', expected_version: row.version } : { progress: 42, expected_revision: row.revision } });
              expect([403, 404]).toContain(writeDenied.status);
              if (reader) expect((await read(reader.id, endpoint, row)).body).toEqual(beforeRefusal!.body);
              // With no authorized GET reader, the outer harness's independent
              // post-handler D1 capture must prove this withheld row unchanged.
              else expect(withheldRows.some(reference => reference.kind === kind && reference.id === row.id)).toBe(true);
              record(kind, row, principal.id, 'private-write-denial');
            }
            measurements.privateDenials++; record(kind, row, principal.id, 'private-denial'); continue;
          }
          const result = await read(principal.id, endpoint, row);
          expect(result.status).toBe(200); expect(result.body).toBeTruthy();
          for (const field of ['id', 'user_id', 'owner_type', 'team_id', 'created_by_user_id', 'updated_by_user_id', 'assigned_to_user_id', 'started_by_user_id', 'completed_by_user_id', 'title', 'version', 'content_version', 'template_id', 'template_version', 'revision', 'progress', 'status', 'deleted_at', 'completed_at', 'started_at']) {
            if (Object.hasOwn(row, field)) expect(result.body[field], `${kind} migrated ${field}`).toEqual(row[field]);
          }
          for (const field of ['items', 'retired_items']) if (Object.hasOwn(row, field)) expect(typeof result.body[field] === 'string' ? JSON.parse(result.body[field]) : result.body[field]).toEqual(JSON.parse(row[field]));
          initial.set(key(endpoint, row), result.body); measurements.rowReads++;
          record(kind, row, principal.id, 'read');
          if (role && row.deleted_at == null) {
            await browserVisit(principal.id, kind, row);
            record(kind, row, principal.id, parseLegacySections(row.items).success ? 'browser-read' : 'browser-refusal');
          }
          if (role < minimumWriteRole && row.deleted_at == null) {
            const denied = await request(principal.id, `/${endpoint}/${row.id}`, { method: 'PUT', data: kind === 'templates' ? { title: 'Forbidden source write', expected_version: row.version } : { progress: 42, expected_revision: row.revision } });
            expect(denied.status).toBe(403);
            expect((await read(principal.id, endpoint, row)).body).toEqual(result.body);
            measurements.roleWriteDenials++;
            record(kind, row, principal.id, 'role-write-denial');
          }
        }
        if (authorized.length && row.deleted_at == null && !valid(kind, row)) {
          const writer = authorized.find(principal => roleFor(row, principal.id) >= minimumWriteRole);
          expect(writer, 'Malformed source refusal needs a genuinely authorized writer').toBeTruthy();
          const refused = await request(writer.id, `/${endpoint}/${row.id}`, { method: 'PUT', data: kind === 'templates' ? { title: 'Unsafe malformed overwrite', expected_version: row.version } : { progress: 42, expected_revision: row.revision } });
          expect(refused.status).toBe(409);
          expect((await read(writer.id, endpoint, row)).body).toEqual(initial.get(key(endpoint, row)));
          malformedSourceChecks.push({ kind, id: row.id, principal: writer.id, invalidItems: !parseLegacySections(row.items).success, invalidRetiredItems: kind === 'runs' && !validRetiredChecklistContent(row.retired_items), refusalStatus: refused.status, unchanged: true, unchangedAfterPositiveWrites: false });
          record(kind, row, writer.id, 'malformed-refusal');
          const parsed = parseLegacySections(row.items);
          if (kind === 'runs' && row.status === 'in_progress' && parsed.success && parsed.data.some(section => section.items.length)) {
            await browserVisit(writer.id, kind, row);
            const page = pages.get(writer.id);
            const notes = page.getByRole('textbox', { name: 'Task notes', exact: true });
            await notes.fill('Rejected malformed source browser canary');
            const refusal = page.waitForResponse(response => response.url().endsWith(`/checklists/${row.id}`) && response.request().method() === 'PUT');
            await notes.locator('..').getByRole('button', { name: 'Save notes', exact: true }).click();
            expect((await refusal).status()).toBe(409);
            await expect(page.getByText('Checklist content is invalid; stored data has not been changed.', { exact: true })).toBeVisible();
            await expect(page.getByText('Saved to this run', { exact: true })).toHaveCount(0);
            expect((await read(writer.id, endpoint, row)).body).toEqual(initial.get(key(endpoint, row)));
            record(kind, row, writer.id, 'browser-write-refusal');
          }
        }
      }
    }
    for (const [kind, endpoint, minimumWriteRole] of families) {
      const ownershipContexts = new Map(state.rows[kind].map(row => [row.team_id == null ? `user:${row.user_id}` : `team:${row.team_id}`, row]));
      for (const [contextId, representative] of ownershipContexts) {
        const writer = state.cohort.principals.find(principal => roleFor(representative, principal.id) >= minimumWriteRole);
        if (!writer) { contexts.push({ kind, contextId, write: 'no-authorized-source-writer' }); continue; }
        const sameContext = row => row.team_id == null ? representative.team_id == null && row.user_id === representative.user_id : row.team_id === representative.team_id;
        const eligible = row => sameContext(row) && row.deleted_at == null && !row.is_public && valid(kind, row) && (kind !== 'runs' || row.status === 'in_progress');
        const row = state.rows[kind].find(row => eligible(row) && (kind !== 'templates' || state.rows.runs.filter(run => run.template_id === row.id && run.deleted_at == null && run.status === 'in_progress').every(run => valid('runs', run))));
        expect(row, `Source has no eligible valid active private ${kind === 'runs' ? 'run' : 'template'} in ${contextId}; no replacement fixture is allowed`).toBeTruthy();
        const collection = await request(writer.id, `/${endpoint}${suffix(row)}`);
        expect(collection.status).toBe(200); expect(collection.body.some(entry => entry.id === row.id)).toBe(true);
        const current = await read(writer.id, endpoint, row);
        const result = await request(writer.id, `/${endpoint}/${row.id}`, { method: 'PUT', data: kind === 'templates' ? { title: 'Sanitized Template Handler Verified', expected_version: current.body.version } : { progress: 42, expected_revision: current.body.revision } });
        expect(result.status).toBe(200);
        expect((await read(writer.id, endpoint, row)).body[kind === 'templates' ? 'title' : 'progress']).toBe(kind === 'templates' ? 'Sanitized Template Handler Verified' : 42);
        measurements[kind === 'templates' ? 'templateWrites' : 'runWrites']++;
        await browserVisit(writer.id, kind, row, true);
        contexts.push({ kind, contextId, principal: writer.id, id: row.id, write: 'pass', browserWriteReadback: 'pass' });
      }
    }
    for (const check of malformedSourceChecks) {
      const endpoint = check.kind === 'templates' ? 'templates' : 'checklists';
      const row = state.rows[check.kind].find(row => row.id === check.id);
      expect((await read(check.principal, endpoint, row)).body).toEqual(initial.get(key(endpoint, row)));
      check.unchangedAfterPositiveWrites = true;
    }
    expect(measurements.templateWrites).toBeGreaterThan(0); expect(measurements.runWrites).toBeGreaterThan(0);
    const output = process.env.PLAYWRIGHT_REHEARSAL_PROOF;
    if (!output) throw new Error('Rehearsal proof output is required.');
    const { rows: _rows, cohort: _cohort, commit, migrationRange, transformation, sourceProfile, manifestIntegritySha256, ...postMigrationState } = state;
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ verdict: 'pass', commit, target: { environment: 'local', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: 'local:miniflare:DB@isolated-data-regression' }, migrationRange, sourceProfile, manifestIntegritySha256, sanitizerArtifactSha256: process.env.PLAYWRIGHT_SANITIZER_SHA256, postMigrationState, transformation, handlerStateReadback: true, malformedSourceChecks, cohortProof: { cohortSha256: state.cohortSha256, requirementsSha256: state.requirementsSha256, cases, selectedCounts: manifest.selection.selectedCounts, profileExclusions: manifest.selection.profileExclusions, authenticatedPrincipals: [...sessions.keys()], contexts, withheldRows, measurements }, checks: { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true } }, null, 2));
  } finally { for (const context of sessions.values()) await context.close(); }
});

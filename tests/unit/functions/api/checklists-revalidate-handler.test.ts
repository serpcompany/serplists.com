import { describe, it, expect, beforeEach } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, PRO_PLAN, resetToASignedInUser, TEAM_PLAN } from '../../../support/checklistsHandler';
import { activeMember, personalRunRow, personalTemplateRow } from '../../../fixtures/handlerRows';
import { jsonObject, readJson } from '../../../support/readJson';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

import { handleChecklists } from '@functions/api/handlers/checklists';

const membership = activeMember('runner');

function run(overrides: Record<string, unknown> = {}) {
  return personalRunRow({
    template_id: 'template-1',
    items: JSON.stringify([{ id: 'section-1', title: 'Old', items: [{ id: 'item-1', title: 'Old', isCompleted: true }] }]),
    retired_items: '[]',
    template_version: 1,
    revision: 2,
    is_public: false,
    ...overrides,
  });
}

function template(overrides: Record<string, unknown> = {}) {
  return personalTemplateRow({
    version: 3,
    items: JSON.stringify([{ id: 'section-1', title: 'Private', items: [{ id: 'item-1', title: 'Confidential step' }] }]),
    is_public: false,
    ...overrides,
  });
}

async function revalidate() {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
    method: 'POST',
    body: JSON.stringify({ expected_revision: 2 }),
  }), mockEnv);
  return { response, data: await readJson(response, jsonObject) };
}

function expectNothingWritten() {
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

describe('run revalidation source access, under the same source rule as run creation', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', PRO_PLAN, TEAM_PLAN);
  });

  it('refuses another user\'s private Personal template for a Personal run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([template({ user_id: 'other-user' })]);

    const { response, data } = await revalidate();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Source template not found');
    expect(data.code).toBe('source_template_unavailable');
    expect(JSON.stringify(data)).not.toContain('Confidential');
    expectNothingWritten();
  });

  it('refuses another member\'s private Personal template for an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ team_id: 'team-1', user_id: 'other-user' })])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([template({ user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it('refuses a private Organization template for a Personal run, even for a member', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([template({ owner_type: 'team', team_id: 'team-1', user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it('refuses another Organization\'s private template for an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ team_id: 'team-1' })])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([template({ owner_type: 'team', team_id: 'team-2', user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it.each([
    ['another user\'s public template', {}, { user_id: 'other-user', is_public: true }],
    ['a public template stored as 1', {}, { user_id: 'other-user', is_public: 1 }],
    ['the caller\'s own private Personal template', {}, {}],
    ['the caller\'s own Personal template for an Organization run', { team_id: 'team-1' }, {}],
    ['a private template of the run\'s Organization', { team_id: 'team-1' }, { owner_type: 'team', team_id: 'team-1', user_id: 'other-user' }],
  ])('reconciles from %s', async (_label, runOverrides, templateOverrides) => {
    const teamRun = 'team_id' in runOverrides;
    dbMocks.selectChain.limit.mockResolvedValueOnce([run(runOverrides)]);
    if (teamRun) {
      dbMocks.selectChain.limit.mockResolvedValueOnce([membership]).mockResolvedValueOnce([membership]);
    }
    dbMocks.selectChain.limit.mockResolvedValueOnce([template(templateOverrides)]);

    const { response, data } = await revalidate();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ success: true, template_version: 3 }));
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });
});

describe('run staleness only counts sources the caller may use', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', PRO_PLAN, TEAM_PLAN);
  });

  it('checks visibility and archive state in the current_template_version subquery', async () => {
    await handleChecklists(new Request('http://localhost/api/checklists', { method: 'GET' }), mockEnv);

    const fields = firstOf(dbMocks.db.select.mock.calls)[0] as { current_template_version: SQL };
    const query = new SQLiteSyncDialect().sqlToQuery(fields.current_template_version);
    expect(query.sql).toMatch(/deleted_at" is null/i);
    expect(query.sql).toMatch(/is_public" = 1/i);
    expect(query.sql).toMatch(/"checklist_runs"\."team_id"/);
    expect(query.params).toContain('user-123');
  });
});

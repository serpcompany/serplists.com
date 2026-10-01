import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, PRO_PLAN, resetToASignedInUser } from '../../../support/checklistsHandler';
import { jsonObject, readJson } from '../../../support/readJson';

import { handleChecklists } from '@functions/api/handlers/checklists';

const membership = { id: 'member-1', team_id: 'team-1', user_id: 'member-b', role: 'runner', status: 'active' };
const sections = [{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: true }] }];
const COMPLETED_AT = '2026-01-01T00:00:00.000Z';

function organizationRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'member-a',
    team_id: 'team-1',
    template_id: 'template-1',
    title: 'Release',
    items: JSON.stringify(sections),
    retired_items: '[]',
    status: 'completed',
    progress: 100,
    completed_at: COMPLETED_AT,
    completed_by_user_id: 'member-a',
    template_version: 1,
    revision: 4,
    is_public: false,
    share_token: null,
    ...overrides,
  };
}

function mockMemberBSavingOrganizationRun(overrides: Record<string, unknown> = {}) {
  const runLookup = [organizationRun(overrides)];
  const canViewRunMembership = [membership];
  const canUpdateRunMembership = [membership];
  dbMocks.selectChain.limit
    .mockResolvedValueOnce(runLookup)
    .mockResolvedValueOnce(canViewRunMembership)
    .mockResolvedValueOnce(canUpdateRunMembership);
}

async function put(body: Record<string, unknown>) {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
    method: 'PUT',
    body: JSON.stringify({ expected_revision: 4, ...body }),
  }), mockEnv);
  return { response, data: await readJson(response, jsonObject) };
}

function savedUpdates(): Record<string, unknown> {
  expect(dbMocks.updateChain.set).toHaveBeenCalledOnce();
  return firstOf(dbMocks.updateChain.set.mock.calls)[0];
}

function auditDiff(): Record<string, unknown> {
  const auditRow = dbMocks.insertChain.values.mock.calls
    .map(([row]) => row as Record<string, unknown>)
    .find((row) => typeof row.diff_json === 'string');
  assert.exists(auditRow);
  return JSON.parse(auditRow.diff_json as string);
}

describe('run completion stamps on PUT /api/checklists/:id, which only a transition into completed writes', () => {
  beforeEach(() => {
    resetToASignedInUser('member-b', PRO_PLAN);
  });

  it('keeps the original completer and time when another member renames a completed run', async () => {
    mockMemberBSavingOrganizationRun();

    const { response } = await put({
      title: 'Renamed',
      status: 'completed',
      progress: 100,
      completed_at: COMPLETED_AT,
      sections,
    });

    expect(response.status).toBe(200);
    const updates = savedUpdates();
    expect(updates).toEqual(expect.objectContaining({ title: 'Renamed', status: 'completed' }));
    expect(updates).not.toHaveProperty('completed_by_user_id');
    expect(updates).not.toHaveProperty('completed_at');
    expect(auditDiff()).not.toHaveProperty('completed_by_user_id');
  });

  it('ignores a different completed_at sent for a run that is already completed', async () => {
    mockMemberBSavingOrganizationRun();

    await put({ status: 'completed', completed_at: '2026-05-05T00:00:00.000Z', sections });

    const updates = savedUpdates();
    expect(updates).not.toHaveProperty('completed_at');
    expect(updates).not.toHaveProperty('completed_by_user_id');
  });

  it('dates a legacy completed run once, then leaves the date alone', async () => {
    mockMemberBSavingOrganizationRun({ completed_at: null });
    await put({ status: 'completed', title: 'Renamed' });

    const first = savedUpdates();
    expect(typeof first.completed_at).toBe('string');
    expect(first).not.toHaveProperty('completed_by_user_id');

    vi.clearAllMocks();
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    mockMemberBSavingOrganizationRun({ completed_at: first.completed_at, revision: 4 });
    const saveFromAClientStillHoldingNoCompletedAt = { status: 'completed', title: 'Renamed again' };
    await put(saveFromAClientStillHoldingNoCompletedAt);

    expect(savedUpdates()).not.toHaveProperty('completed_at');
  });

  it('stamps the completer and time when the run becomes completed', async () => {
    mockMemberBSavingOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });
    const before = Date.now();

    await put({ status: 'completed', sections });

    const updates = savedUpdates();
    expect(updates.completed_by_user_id).toBe('member-b');
    expect(Date.parse(updates.completed_at as string)).toBeGreaterThanOrEqual(before - 1000);
    expect(auditDiff()).toEqual(expect.objectContaining({ completed_by_user_id: 'member-b' }));
  });

  it('keeps the completion time the client sends when the run becomes completed', async () => {
    mockMemberBSavingOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });

    await put({ status: 'completed', completed_at: '2026-02-02T10:00:00.000Z' });

    expect(savedUpdates()).toEqual(expect.objectContaining({
      completed_at: '2026-02-02T10:00:00.000Z',
      completed_by_user_id: 'member-b',
    }));
  });

  it('never completes a run with a null completion time', async () => {
    mockMemberBSavingOrganizationRun({ status: 'in_progress', completed_at: null, completed_by_user_id: null });

    await put({ status: 'completed', completed_at: null });

    expect(typeof savedUpdates().completed_at).toBe('string');
  });

  it('keeps the completion stamps when a completed run is reopened', async () => {
    mockMemberBSavingOrganizationRun();

    await put({ status: 'in_progress', completed_at: COMPLETED_AT });

    const updates = savedUpdates();
    expect(updates.status).toBe('in_progress');
    expect(updates).not.toHaveProperty('completed_at');
    expect(updates).not.toHaveProperty('completed_by_user_id');
  });

  it('ignores completed_at on saves of a run that is in progress', async () => {
    mockMemberBSavingOrganizationRun({ status: 'in_progress', completed_at: COMPLETED_AT });

    await put({ status: 'in_progress', completed_at: '2026-05-05T00:00:00.000Z', sections });

    expect(savedUpdates()).not.toHaveProperty('completed_at');
  });
});

describe('run completion stamps on POST /api/checklists', () => {
  beforeEach(() => {
    resetToASignedInUser('member-b', PRO_PLAN);
  });

  it('stamps a run created as completed', async () => {
    const response = await handleChecklists(new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Done already', sections, status: 'completed' }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const inserted = firstOf(dbMocks.insertChain.values.mock.calls)[0] as Record<string, unknown>;
    expect(inserted.status).toBe('completed');
    expect(inserted.completed_by_user_id).toBe('member-b');
    expect(typeof inserted.completed_at).toBe('string');
  });
});

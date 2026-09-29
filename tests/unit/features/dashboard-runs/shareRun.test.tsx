import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunsDashboardView } from '@/components/dashboard/RunsDashboardView';
import { createRunSharingActions, createRunsDashboardShareUrl } from '@/features/dashboard-runs/shareRun';
import { createApiError } from '@/lib/api-errors';
import { getResourcePermissions } from '@/lib/organizationPermissions';
import { markRunShared } from '@/lib/queryCache';
import { createShareLinkAndCopy } from '@/lib/shareLink';
import type { ChecklistRun } from '@/types/checklist';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const staleRun: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Quarterly audit',
  status: 'completed',
  progress: 100,
  sections: [{ id: 's1', title: 'Checklist', items: [{ id: 'i1', title: 'Check', isCompleted: true }] }],
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-02T00:00:00.000Z',
  userId: 'user-1',
  revision: 3,
  isStale: true,
  isPublic: false,
};

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

const renderRuns = (runs: ChecklistRun[]) =>
  renderToStaticMarkup(
    <StaticRouter location="/dashboard/runs">
      <RunsDashboardView
        getRunPermissions={() => getResourcePermissions(undefined, () => undefined)}
        onDeleteRun={vi.fn()}
        onRevalidateRun={vi.fn()}
        runs={runs}
      />
    </StaticRouter>,
  );

const refuseCopy = async (): Promise<boolean> => {
  throw new Error('The request is not allowed by the user agent');
};

// The API makes a shared run public, and revalidating a public run fails with 409. The runs
// list is cached for 5 minutes, so it kept offering Revalidate after a share.
describe('sharing a run from the runs list', () => {
  it('marks the cached run shared as soon as the link exists, even when the copy fails', async () => {
    const client = new QueryClient();
    clients.push(client);
    const personal = ['runs', 'user-1', 'personal'];
    client.setQueryData(personal, [staleRun, { ...staleRun, id: 'run-2' }]);
    expect(renderRuns(client.getQueryData<ChecklistRun[]>(personal) ?? [])).toContain('>Revalidate<');
    const apiClient = { createChecklistRunShare: vi.fn().mockResolvedValue({ shareToken: 'token-1' }) };

    const result = await createShareLinkAndCopy(
      () =>
        createRunsDashboardShareUrl('run-1', 'https://serplists.com', apiClient, (runId) => {
          void markRunShared(client, runId);
        }),
      refuseCopy,
    );

    expect(result).toEqual({ kind: 'ok', copied: false, shareUrl: 'https://serplists.com/share/token-1' });
    const cached = client.getQueryData<ChecklistRun[]>(personal) ?? [];
    expect(cached.map((run) => run.isPublic)).toEqual([true, false]);
    const html = renderRuns(cached.slice(0, 1));
    expect(html).toContain('Shared snapshot is out of date');
    expect(html).not.toContain('>Revalidate<');
  });

  it('leaves the run private when the share fails', async () => {
    const onShared = vi.fn();
    const apiClient = { createChecklistRunShare: vi.fn().mockRejectedValue(new Error('Run not found')) };

    await expect(
      createRunsDashboardShareUrl('run-1', 'https://serplists.com', apiClient, onShared),
    ).rejects.toThrow('Run not found');
    expect(onShared).not.toHaveBeenCalled();
  });
});

// A run archived in another tab, by a teammate or over MCP stays in the cached runs list for
// up to 5 minutes. Share and Stop sharing on it answer 404; the list must reload so the run
// leaves it, instead of every retry failing the same way.
describe('Share and Stop sharing on a run archived elsewhere', () => {
  const archived = () => createApiError(404, { error: 'Checklist run not found' });

  it('reloads the runs list before a refused Stop sharing rejects', async () => {
    const error = archived();
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const apiClient = { revokeChecklistRunShare: vi.fn().mockRejectedValue(error) };

    await expect(createRunSharingActions({ invalidateQueries }, apiClient).stopSharingRun('run-1')).rejects.toBe(error);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['runs'] });
  });

  it('reloads the runs list before a refused Share rejects', async () => {
    const error = archived();
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const { refreshAfterShareFailure } = createRunSharingActions({ invalidateQueries });
    const apiClient = { createChecklistRunShare: vi.fn().mockRejectedValue(error) };
    const onShared = vi.fn();

    const result = await createShareLinkAndCopy(() =>
      createRunsDashboardShareUrl('run-1', 'https://serplists.com', apiClient, onShared, refreshAfterShareFailure),
    );

    expect(result).toMatchObject({ kind: 'error', message: 'Checklist run not found' });
    expect(onShared).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['runs'] });
  });

  it('leaves the runs list alone for a failure a refresh cannot fix', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const actions = createRunSharingActions({ invalidateQueries });
    const failure = createApiError(500, { error: 'Internal error' });

    await expect(
      createRunSharingActions({ invalidateQueries }, {
        revokeChecklistRunShare: vi.fn().mockRejectedValue(failure),
      }).stopSharingRun('run-1'),
    ).rejects.toBe(failure);
    await expect(
      createRunsDashboardShareUrl(
        'run-1',
        'https://serplists.com',
        { createChecklistRunShare: vi.fn().mockRejectedValue(failure) },
        undefined,
        actions.refreshAfterShareFailure,
      ),
    ).rejects.toBe(failure);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

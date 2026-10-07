import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

vi.mock('react', async (importOriginal) => {
  const { useRefKeptBetweenRenders, useStateKeptBetweenRenders } = await import('../../../support/hookStateSlots');
  return { ...(await importOriginal<typeof import('react')>()), useRef: useRefKeptBetweenRenders, useState: useStateKeptBetweenRenders };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';
import { useRunRevalidation } from '@/features/dashboard-runs/useRunRevalidation';

import { buildRun } from '../../../fixtures/runExecutionFixtures';
import { forgetKeptState, renderKeepingState } from '../../../support/hookStateSlots';

const run = (id: string) => buildRun({ id, revision: 3, isStale: true, isPublic: false });
const runA = run('run-a');
const runB = run('run-b');

const openRequests: Array<{ runId: string; resolve: () => void; reject: (error: unknown) => void }> = [];
const onRevalidateRun = vi.fn(
  (target: ChecklistRun) =>
    new Promise<void>((resolve, reject) => {
      openRequests.push({ runId: target.id, resolve, reject });
    }),
);
const settle = (runId: string, error?: Error) => {
  for (const request of openRequests.filter((entry) => entry.runId === runId)) {
    if (error) request.reject(error);
    else request.resolve();
  }
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function RunsList() {
  return useRunRevalidation(onRevalidateRun);
}

const rendered = () => renderKeepingState(RunsList);

beforeEach(() => {
  forgetKeptState();
  openRequests.length = 0;
  onRevalidateRun.mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('useRunRevalidation', () => {
  it('keeps each run busy until its own request finishes', async () => {
    const first = rendered().revalidate(runA);
    const second = rendered().revalidate(runB);

    expect(rendered().isRevalidating('run-a')).toBe(true);
    expect(rendered().isRevalidating('run-b')).toBe(true);

    settle('run-a');
    await first;

    expect(rendered().isRevalidating('run-a')).toBe(false);
    expect(rendered().isRevalidating('run-b')).toBe(true);

    settle('run-b');
    await second;

    expect(rendered().isRevalidating('run-b')).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it('sends one request per run however often its Revalidate is pressed, since a second would carry the same revision and fail with 409 edit_conflict', async () => {
    void rendered().revalidate(runA);
    void rendered().revalidate(runB);
    settle('run-a');
    await flush();

    void rendered().revalidate(runB);
    void rendered().revalidate(runB);
    await flush();

    expect(onRevalidateRun.mock.calls.filter(([target]) => target.id === 'run-b')).toHaveLength(1);
    settle('run-b');
    await flush();
  });

  it('frees only the run whose request failed', async () => {
    const first = rendered().revalidate(runA);
    const second = rendered().revalidate(runB);

    settle('run-b', new Error('Network error'));
    await second;

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(rendered().isRevalidating('run-b')).toBe(false);
    expect(rendered().isRevalidating('run-a')).toBe(true);

    settle('run-a');
    await first;
    expect(rendered().isRevalidating('run-a')).toBe(false);
  });
});

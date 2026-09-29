import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

// Vitest runs without a DOM, so a minimal stand-in for React runs the hook: state and refs
// live in `cells`, kept across renders by call order.
const fake = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = fake.cursor++;
    if (!(index in fake.cells)) fake.cells[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    const setState = (next: unknown) => {
      fake.cells[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(fake.cells[index]) : next;
    };
    return [fake.cells[index], setState];
  },
  useRef: (initial: unknown) => {
    const index = fake.cursor++;
    if (!(index in fake.cells)) fake.cells[index] = { current: initial };
    return fake.cells[index];
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';
import { useRunRevalidation } from '@/features/dashboard-runs/useRunRevalidation';

const run = (id: string) => ({ id, revision: 3, isStale: true, isPublic: false }) as ChecklistRun;
const runA = run('run-a');
const runB = run('run-b');

// Each request stays open until the test settles every open request for that run.
const requests: Array<{ runId: string; resolve: () => void; reject: (error: unknown) => void }> = [];
const onRevalidateRun = vi.fn(
  (target: ChecklistRun) =>
    new Promise<void>((resolve, reject) => {
      requests.push({ runId: target.id, resolve, reject });
    }),
);
const settle = (runId: string, error?: Error) => {
  for (const request of requests.filter((entry) => entry.runId === runId)) {
    if (error) request.reject(error);
    else request.resolve();
  }
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// One render of the hook, as the runs list does on each change.
const useRendered = () => {
  fake.cursor = 0;
  return useRunRevalidation(onRevalidateRun);
};

beforeEach(() => {
  fake.cells = [];
  requests.length = 0;
  onRevalidateRun.mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('useRunRevalidation', () => {
  it('keeps each run busy until its own request finishes', async () => {
    const first = useRendered().revalidate(runA);
    const second = useRendered().revalidate(runB);

    expect(useRendered().isRevalidating('run-a')).toBe(true);
    expect(useRendered().isRevalidating('run-b')).toBe(true);

    settle('run-a');
    await first;

    expect(useRendered().isRevalidating('run-a')).toBe(false);
    expect(useRendered().isRevalidating('run-b')).toBe(true);

    settle('run-b');
    await second;

    expect(useRendered().isRevalidating('run-b')).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  // A second request would carry the same revision, and the API refuses one of the two
  // with 409 edit_conflict: a success and a "changed elsewhere" toast for one action.
  it('sends one request per run however often its Revalidate is pressed', async () => {
    void useRendered().revalidate(runA);
    void useRendered().revalidate(runB);
    settle('run-a');
    await flush();

    void useRendered().revalidate(runB);
    void useRendered().revalidate(runB);
    await flush();

    expect(onRevalidateRun.mock.calls.filter(([target]) => target.id === 'run-b')).toHaveLength(1);
    settle('run-b');
    await flush();
  });

  it('frees only the run whose request failed', async () => {
    const first = useRendered().revalidate(runA);
    const second = useRendered().revalidate(runB);

    settle('run-b', new Error('Network error'));
    await second;

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(useRendered().isRevalidating('run-b')).toBe(false);
    expect(useRendered().isRevalidating('run-a')).toBe(true);

    settle('run-a');
    await first;
    expect(useRendered().isRevalidating('run-a')).toBe(false);
  });
});

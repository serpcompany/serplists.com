import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...(await import('../../../support/hookStateSlots')).hooksKeptBetweenRenders,
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { toast } from 'sonner';

import {
  keepRunNoteDrafts,
  takeKeptRunNoteDrafts,
  useKeptRunNoteDrafts,
} from '@/features/run-execution/keptNoteDrafts';
import type { NoteDrafts } from '@/features/run-execution/noteDrafts';
import type { ChecklistRun } from '@/types/checklist';
import { memoryStorage as createStorage } from '../../../fixtures/memoryStorage';
import { forgetKeptState, renderKeepingState, unmountEffects } from '../../../support/hookStateSlots';

const buildRun = (id: string, taskId: string): ChecklistRun => ({
  id,
  templateId: 'template-1',
  title: 'Launch',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-1', title: 'Checklist', items: [{ id: taskId, title: taskId, notes: 'Saved' }] }],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
});

const firstRun = buildRun('run-1', 'task-a');
const secondRun = buildRun('run-2', 'task-b');

let storage: ReturnType<typeof createStorage>;

type RunPageProps = {
  privateRun: ChecklistRun | null;
  noteDrafts?: NoteDrafts;
  restoreNoteDrafts?: (drafts: NoteDrafts) => void;
};

function RunPage({ privateRun, noteDrafts = {}, restoreNoteDrafts = vi.fn() }: RunPageProps) {
  return useKeptRunNoteDrafts({ privateRun, noteDrafts, restoreNoteDrafts });
}

const renderRunPage = (props: RunPageProps) => renderKeepingState(() => RunPage(props));

beforeEach(() => {
  forgetKeptState();
  vi.mocked(toast).mockClear();
  storage = createStorage();
  vi.stubGlobal('window', { sessionStorage: storage });
});

afterEach(() => {
  unmountEffects();
  vi.unstubAllGlobals();
});

describe('useKeptRunNoteDrafts, which the run page leave guard calls when the session ends in the background', () => {
  it("keeps a private run's unsaved notes for the user who typed them", () => {
    const keepNoteDrafts = renderRunPage({ privateRun: firstRun, noteDrafts: { 'task-a': 'Deployed build 42' } });

    expect(keepNoteDrafts()).toBe(true);

    expect(takeKeptRunNoteDrafts({ userId: 'user-1', runId: 'run-1' }, firstRun, storage)).toEqual({
      'task-a': 'Deployed build 42',
    });
  });

  it("lets a shared run's page go without keeping its notes, since the public page stays open with them after a sign-out", () => {
    const keepNoteDrafts = renderRunPage({ privateRun: null, noteDrafts: { 'task-a': 'Guest note' } });

    expect(keepNoteDrafts()).toBe(true);

    expect(storage.items.size).toBe(0);
  });

  it('offers kept notes back once the same user opens their run, also when the page moves to it from another run', () => {
    keepRunNoteDrafts({ userId: 'user-1', runId: 'run-2' }, { 'task-b': 'Checked DNS' }, secondRun, storage);
    const restoreNoteDrafts = vi.fn();

    renderRunPage({ privateRun: firstRun, restoreNoteDrafts });
    expect(restoreNoteDrafts).not.toHaveBeenCalled();

    renderRunPage({ privateRun: secondRun, restoreNoteDrafts });
    expect(restoreNoteDrafts).toHaveBeenCalledWith({ 'task-b': 'Checked DNS' });
    expect(toast).toHaveBeenCalledWith('Your unsaved task notes were restored.');

    renderRunPage({ privateRun: secondRun, restoreNoteDrafts });
    expect(restoreNoteDrafts).toHaveBeenCalledTimes(1);
  });
});

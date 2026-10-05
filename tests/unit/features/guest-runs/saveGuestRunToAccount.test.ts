import { navigation } from '../../../support/mockedNextNavigation';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { readGuestRun, saveGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import type { CreateRun } from '@/features/template-detail/templateActionOutcome';
import { createApiError } from '@/lib/api-errors';
import { resetSectionsCompletion } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import { present, taskAt } from '../../../support/elements';
import { guestRunTemplate } from '../../../support/guestRuns';

const { getChecklistById } = vi.hoisted(() => ({ getChecklistById: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { getChecklistById } }));

import { saveGuestRunToAccount } from '@/features/guest-runs/useSaveGuestRunToAccount';

let restoreWindow: () => void = () => {};
beforeAll(() => {
  restoreWindow = navigation.installWindow();
});
afterAll(() => restoreWindow());

const RUN_LIMIT = 'Your plan allows 3 active runs.';

const createdRun = (): ChecklistRun => ({
  id: 'run-9',
  templateId: guestRunTemplate.id,
  title: 'Lake trip',
  status: 'in_progress',
  progress: 0,
  sections: resetSectionsCompletion(guestRunTemplate.sections),
  startedAt: '2026-10-05T09:00:00.000Z',
  userId: 'user-1',
  revision: 1,
});

let guestRun: ChecklistRun;
const createRun = vi.fn<CreateRun>();
const updateRun = vi.fn<(run: ChecklistRun) => Promise<ChecklistRun>>();

beforeEach(() => {
  navigation.reset('/profile/alice/weekend-camping/run/');
  createRun.mockReset().mockResolvedValue(createdRun());
  updateRun.mockReset().mockImplementation((run: ChecklistRun) => Promise.resolve({ ...run, revision: 2 }));
  getChecklistById.mockReset().mockResolvedValue({
    id: 'run-9',
    template_id: guestRunTemplate.id,
    title: 'Lake trip',
    status: 'in_progress',
    revision: 1,
    sections: resetSectionsCompletion(guestRunTemplate.sections),
  });
  const started = startGuestRun(guestRunTemplate, 'Lake trip');
  guestRun = saveGuestRun({
    ...started,
    sections: started.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => (item.id === 'task-food' ? { ...item, isCompleted: true, notes: 'Bought on Friday' } : item)),
    })),
  });
});

const save = () => saveGuestRunToAccount(guestRunTemplate, guestRun, { createRun, updateRun });

describe('saving a guest run into the account', () => {
  it('starts a Run of the Template under the guest run’s name, carries the progress onto the stored run, and clears the browser’s copy', async () => {
    await expect(save()).resolves.toEqual({ kind: 'ok', runId: 'run-9', teamId: undefined });

    expect(createRun).toHaveBeenCalledWith({ runName: 'Lake trip', template: guestRunTemplate, templateId: guestRunTemplate.id });
    expect(getChecklistById).toHaveBeenCalledWith('run-9');
    const saved = present(updateRun.mock.calls[0]?.[0], 'the run sent to the account');
    expect(saved).toMatchObject({ id: 'run-9', revision: 1, status: 'in_progress' });
    expect(taskAt(saved, 0, 1)).toMatchObject({ id: 'task-food', isCompleted: true, notes: 'Bought on Friday' });
    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
  });

  it('asks for an upgrade, and keeps the guest run, when the Personal plan has no room for another active run', async () => {
    createRun.mockRejectedValue(createApiError(403, { code: 'limit_reached', error: RUN_LIMIT }));

    await expect(save()).resolves.toEqual({ kind: 'upgrade_required' });

    expect(getChecklistById).not.toHaveBeenCalled();
    expect(updateRun).not.toHaveBeenCalled();
    expect(readGuestRun(guestRunTemplate.id)?.id).toBe(guestRun.id);
  });

  it("says why, and keeps the guest run, when the Organization's plan has no room", async () => {
    createRun.mockRejectedValue(
      createApiError(403, { code: 'limit_reached', error: RUN_LIMIT, details: { context: 'organization' } }),
    );

    await expect(save()).resolves.toEqual({ kind: 'error', message: RUN_LIMIT });
    expect(readGuestRun(guestRunTemplate.id)?.id).toBe(guestRun.id);
  });

  it('keeps the guest run when its progress could not be carried over', async () => {
    updateRun.mockRejectedValue(new Error('Network down'));

    await expect(save()).resolves.toEqual({ kind: 'error', message: 'Network down' });
    expect(readGuestRun(guestRunTemplate.id)?.id).toBe(guestRun.id);
  });
});

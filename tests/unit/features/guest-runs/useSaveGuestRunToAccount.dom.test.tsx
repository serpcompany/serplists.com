import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { readGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import type { CreateRun } from '@/features/template-detail/templateActionOutcome';
import { ORGANIZATION_UPGRADE_MESSAGE } from '@/lib/access-flow';
import { createApiError } from '@/lib/api-errors';
import { resetSectionsCompletion } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import { present, taskAt } from '../../../support/elements';
import { guestRunTemplate } from '../../../support/guestRuns';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';
import { theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

const { accountRuns, apiMocks, workspace } = vi.hoisted(() => ({
  accountRuns: {
    createRun: vi.fn<CreateRun>(),
    updateRun: vi.fn<(run: ChecklistRun) => Promise<ChecklistRun>>(),
  },
  apiMocks: {
    createBillingCheckout: vi.fn(() => Promise.resolve({ url: 'https://checkout.stripe.com/c/pay/test' })),
    getBillingStatus: vi.fn(() => Promise.resolve({ billingEnabled: true, plan: 'free' })),
    getChecklistById: vi.fn(),
  },
  workspace: { activeTeamId: undefined as string | undefined, isTeamWorkspace: false },
}));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'user-1' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspace }));
vi.mock('@/contexts/TemplatesContext', () => ({ useTemplates: () => accountRuns }));
vi.mock('@/hooks/usePageVisit', async () => (await import('../../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));

import { useSaveGuestRunToAccount } from '@/features/guest-runs/useSaveGuestRunToAccount';

theInMemoryBrowserAsTheWindow();

const unmounts: Array<() => void> = [];
const beforeLeaving = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(workspace, { activeTeamId: undefined, isTeamWorkspace: false });
  navigation.reset('/profile/alice/weekend-camping/run/');
  accountRuns.createRun.mockResolvedValue({
    id: 'run-9',
    templateId: guestRunTemplate.id,
    title: 'Lake trip',
    status: 'in_progress',
    progress: 0,
    sections: [],
    startedAt: '2026-10-05T09:00:00.000Z',
    userId: 'user-1',
    revision: 1,
  });
  accountRuns.updateRun.mockImplementation((run) => Promise.resolve(run));
  apiMocks.getChecklistById.mockResolvedValue({
    id: 'run-9',
    revision: 1,
    sections: resetSectionsCompletion(guestRunTemplate.sections),
    status: 'in_progress',
    title: 'Lake trip',
  });
  startGuestRun(guestRunTemplate, 'Lake trip');
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function saveToAccount(noteDrafts: Record<string, string> = {}) {
  const page = await mountQueryHook(() => useSaveGuestRunToAccount(guestRunTemplate, beforeLeaving));
  unmounts.push(page.unmount);
  await act(async () => {
    await page.current().save(noteDrafts);
    await settle();
  });
  return page.current;
}

describe('Save to account, offered once a guest signs up or logs in', () => {
  it('saves the run with the notes still being typed, says so, and opens the new Run', async () => {
    await saveToAccount({ 'task-lock': 'Spare key with the neighbours' });

    const saved = present(accountRuns.updateRun.mock.calls[0]?.[0], 'the run sent to the account');
    expect(taskAt(saved, 1, 0).notes).toBe('Spare key with the neighbours');
    expect(toast.success).toHaveBeenCalledWith('Run saved to your account');
    expect(beforeLeaving).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/dashboard/runs/run-9/');
    expect(readGuestRun(guestRunTemplate.id)).toBeNull();
  });

  it('starts Personal checkout, and stays busy while the browser leaves, when the Free plan has no room for another active run', async () => {
    accountRuns.createRun.mockRejectedValue(createApiError(403, { code: 'limit_reached', error: 'Your plan allows 3 active runs.' }));

    const hook = await saveToAccount();

    expect(apiMocks.createBillingCheckout).toHaveBeenCalledTimes(1);
    expect(navigation.documentLoads).toEqual([{ kind: 'assign', href: 'https://checkout.stripe.com/c/pay/test' }]);
    expect(hook().isSaving).toBe(true);
    expect(readGuestRun(guestRunTemplate.id)?.title).toBe('Lake trip');
    expect(navigation.log).toEqual([]);
  });

  it("explains that the Organization needs a paid plan instead of starting a Personal checkout", async () => {
    workspace.activeTeamId = 'team-1';
    workspace.isTeamWorkspace = true;
    accountRuns.createRun.mockRejectedValue(createApiError(403, { code: 'upgrade_required', error: 'Upgrade needed.' }));

    const hook = await saveToAccount();

    expect(apiMocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ORGANIZATION_UPGRADE_MESSAGE);
    expect(hook().isSaving).toBe(false);
    expect(readGuestRun(guestRunTemplate.id)?.title).toBe('Lake trip');
  });
});

import { act, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateRun, CreateTemplate } from '@/features/template-detail/templateActionOutcome';
import { createApiError } from '@/lib/api-errors';
import { HISTORY_DISPLAY_LIMIT, HISTORY_FULL_LIMIT } from '@/lib/schemas/historyLimits';
import type { ChecklistTemplate } from '@/types/checklist';

import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const apiMock = vi.hoisted(() => ({
  getTemplateById: vi.fn(),
  getTemplateHistory: vi.fn(),
  getBillingStatus: vi.fn(),
  transferTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  getProfileById: vi.fn(),
  getTemplateBySlug: vi.fn(),
  clonePublicTemplate: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: apiMock }));

import {
  useTemplateDetailModel,
  type UseTemplateDetailModelOptions,
} from '@/features/template-detail/useTemplateDetailModel';

const storedTemplate = {
  id: 'template-7',
  title: 'Quarterly Audit',
  sections: [{ id: 'section-1', title: 'Collect', items: [{ id: 'item-1', title: 'Export rankings' }] }],
  user_id: 'user-1',
  owner_username: 'alice',
  created_at: '2026-09-01T00:00:00.000Z',
  is_public: false,
  slug: 'quarterly-audit',
  version: 2,
};

const createRun = vi.fn<CreateRun>();
const createTemplate = vi.fn<CreateTemplate>();

const onTheTemplatePage: UseTemplateDetailModelOptions = {
  mode: 'private',
  canEditTemplates: true,
  identifier: 'template-7',
  isAuthenticated: true,
  userId: 'user-1',
  username: 'alice',
  teamId: undefined,
  workspaceStatus: 'ready',
  createRun,
  createTemplate,
};

const theCopy: ChecklistTemplate = {
  id: 'copy-1',
  title: 'Quarterly Audit (copy)',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  isPublic: false,
};

let server: Record<string, unknown> = { ...storedTemplate };

const unmounts: Array<() => void> = [];
beforeEach(() => {
  Object.values(apiMock).forEach((mock) => mock.mockReset());
  createRun.mockReset();
  createTemplate.mockReset();
  server = { ...storedTemplate };
  apiMock.getTemplateById.mockImplementation(async () => ({ ...server }));
  apiMock.getBillingStatus.mockResolvedValue({ billingEnabled: true, plan: 'free' });
  apiMock.getTemplateHistory.mockResolvedValue({ templateId: 'template-7', events: [], versions: [] });
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function openTheTemplate(options = onTheTemplatePage) {
  const page = await mountQueryHook(() => useTemplateDetailModel(options));
  unmounts.push(page.unmount);
  await act(settle);
  expect(page.current().template?.title).toBe('Quarterly Audit');
  return page.current;
}

function aShareSaveThatWaits() {
  let finishSaving = () => {};
  apiMock.updateTemplate.mockImplementation(
    () => new Promise((resolve) => {
      finishSaving = () => resolve({ success: true, id: 'template-7', version: 3, slug: 'quarterly-audit' });
    }),
  );
  return (sharing: Promise<unknown>) =>
    act(async () => {
      finishSaving();
      await sharing;
      await settle();
    });
}

describe('the actions on a template page', () => {
  it('starts a run of the template under the name typed', async () => {
    createRun.mockResolvedValue({
      id: 'run-3', templateId: 'template-7', title: 'Q3 audit', status: 'in_progress', progress: 0,
      sections: [], startedAt: '2026-09-02T00:00:00.000Z', userId: 'user-1',
    });
    const page = await openTheTemplate();

    expect(await page().startRun('Q3 audit')).toStrictEqual({ kind: 'ok', runId: 'run-3', teamId: undefined });
    expect(createRun.mock.calls.map(([params]) => [params.templateId, params.runName])).toEqual([['template-7', 'Q3 audit']]);
  });

  it('makes a copy of the template', async () => {
    createTemplate.mockResolvedValue(theCopy);
    const page = await openTheTemplate();

    expect(await page().duplicateTemplate()).toStrictEqual({ kind: 'ok', templateId: 'copy-1', teamId: undefined });
    expect(createTemplate.mock.calls.map(([copy]) => copy.sections.map((section) => section.title))).toEqual([['Collect']]);
  });

  it('shares a Personal template at its public address and shows it as public', async () => {
    apiMock.updateTemplate.mockImplementation(async () => {
      server = { ...server, is_public: true, version: 3 };
      return { success: true, id: 'template-7', version: 3, slug: 'quarterly-audit' };
    });
    const page = await openTheTemplate();

    const shared = await act(async () => page().shareTemplate());
    await act(settle);

    expect(shared).toEqual({ kind: 'ok', shareUrl: `${window.location.origin}/profile/alice/quarterly-audit/` });
    expect(apiMock.updateTemplate).toHaveBeenCalledWith('template-7', { is_public: true, expected_version: 2 });
    expect(page().template).toMatchObject({ isPublic: true, version: 3 });
  });

  it('keeps showing the template opened while an earlier share was still saving', async () => {
    const finishTheShare = aShareSaveThatWaits();
    apiMock.getTemplateById.mockImplementation(async (id: string) =>
      id === 'template-8' ? { ...storedTemplate, id: 'template-8', title: 'Annual Review', slug: 'annual-review' } : { ...server },
    );
    const page = await mountQueryHook(() => {
      const [identifier, open] = useState('template-7');
      return { model: useTemplateDetailModel({ ...onTheTemplatePage, identifier }), open };
    });
    unmounts.push(page.unmount);
    await act(settle);

    const sharing = page.current().model.shareTemplate();
    act(() => page.current().open('template-8'));
    await vi.waitFor(async () => {
      await act(settle);
      expect(page.current().model.template?.title).toBe('Annual Review');
    });

    await finishTheShare(sharing);

    expect(await sharing).toEqual({ kind: 'ok', shareUrl: `${window.location.origin}/profile/alice/quarterly-audit/` });
    expect(page.current().model.template).toMatchObject({ id: 'template-8', title: 'Annual Review', isPublic: false });
  });

  it('leaves a template deleted while its share was saving gone, rather than showing it again', async () => {
    const finishTheShare = aShareSaveThatWaits();
    const page = await openTheTemplate();
    const sharing = page().shareTemplate();
    apiMock.getTemplateById.mockRejectedValue(createApiError(404, { error: 'Not found' }));
    apiMock.getTemplateBySlug.mockRejectedValue(createApiError(404, { error: 'Not found' }));

    act(() => page().reload());
    await vi.waitFor(async () => {
      await act(settle);
      expect(page().notFound).toBe(true);
    });
    await finishTheShare(sharing);

    expect(page().template).toBeNull();
    expect(page().notFound).toBe(true);
  });

  it('moves the template into an Organization and shows it there', async () => {
    apiMock.transferTemplate.mockImplementation(async () => {
      server = { ...server, team_id: 'team-9', owner_type: 'team', version: 3 };
      return { success: true, id: 'template-7', teamId: 'team-9', version: 3 };
    });
    const page = await openTheTemplate();

    const moved = await act(async () => page().transferTemplate('team-9'));
    await act(settle);

    expect(moved).toEqual({ kind: 'ok', templateId: 'template-7', teamId: 'team-9' });
    expect(apiMock.transferTemplate).toHaveBeenCalledWith('template-7', { teamId: 'team-9', expectedVersion: 2 });
    expect(page().template).toMatchObject({ ownerType: 'team', teamId: 'team-9', version: 3 });
  });

  it('checks the plan again when saving a copy after the plan could not be read', async () => {
    apiMock.getBillingStatus.mockRejectedValue(createApiError(400, { error: 'Bad request' }));
    server = { ...storedTemplate, is_public: true };
    const page = await openTheTemplate();
    const checks = apiMock.getBillingStatus.mock.calls.length;

    expect(await act(async () => page().saveTemplate())).toEqual({ kind: 'error', message: "Couldn't check your plan. Try again." });
    await act(settle);

    expect(apiMock.getBillingStatus.mock.calls.length).toBeGreaterThan(checks);
  });

  it('copies a public template into Personal for a Pro member', async () => {
    apiMock.getBillingStatus.mockResolvedValue({ billingEnabled: true, plan: 'pro' });
    apiMock.clonePublicTemplate.mockResolvedValue({ id: 'copy-1' });
    server = { ...storedTemplate, is_public: true };
    const page = await openTheTemplate();

    expect(await act(async () => page().saveTemplate())).toEqual({ kind: 'ok', templateId: 'copy-1', teamId: undefined });
    expect(apiMock.clonePublicTemplate).toHaveBeenCalledWith('template-7', { teamId: undefined, visibility: 'private' });
  });

  it('copies nothing from a page whose template is gone', async () => {
    apiMock.getTemplateById.mockRejectedValue(createApiError(404, { error: 'Not found' }));
    const page = await mountQueryHook(() => useTemplateDetailModel(onTheTemplatePage));
    unmounts.push(page.unmount);
    await act(settle);

    expect(page.current().template).toBeNull();
    expect(await page.current().duplicateTemplate()).toEqual({ kind: 'error', message: 'Template not found.' });
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('loads the whole history once View all is chosen', async () => {
    const page = await openTheTemplate();
    expect(apiMock.getTemplateHistory).toHaveBeenLastCalledWith('template-7', { limit: HISTORY_DISPLAY_LIMIT });

    await act(async () => {
      page().history.onViewAll();
      await settle();
    });

    expect(page().history.showingAll).toBe(true);
    expect(apiMock.getTemplateHistory).toHaveBeenLastCalledWith('template-7', { limit: HISTORY_FULL_LIMIT });
  });

  it('refreshes the cached template lists after a move', async () => {
    apiMock.transferTemplate.mockResolvedValue({ success: true, id: 'template-7', teamId: 'team-9', version: 3 });
    const page = await mountQueryHook(() => ({
      model: useTemplateDetailModel({ ...onTheTemplatePage, userId: 'user-1' }),
      lists: useQueryClient(),
    }));
    unmounts.push(page.unmount);
    await act(settle);
    page.current().lists.setQueryData(['templates', 'user-1', 'personal'], []);

    await act(async () => page.current().model.transferTemplate('team-9'));

    expect(page.current().lists.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
  });
});

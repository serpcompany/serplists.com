import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { WORKSPACE_NOT_READY_MESSAGE } from '@/contexts/workspaceSelection';
import {
  followTemplateActionResult,
  saveTemplateToAccount,
} from '@/features/template-detail/templateActionOutcome';
import type { TemplateDetailActionResult } from '@/features/template-detail/useTemplateDetailModel';
import type { PageVisit } from '@/lib/navigation/pageVisit';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

const visit = (current: boolean): PageVisit => ({ isCurrent: () => current });

const handlers = () => ({
  loginRequired: vi.fn(),
  upgradeRequired: vi.fn(),
  succeeded: vi.fn(),
});

beforeEach(() => {
  toastMocks.error.mockClear();
  toastMocks.success.mockClear();
});

describe('followTemplateActionResult, which moves the user to a run, a template, sign-in or checkout only while they are still on the template page', () => {
  it.each<[string, TemplateDetailActionResult]>([
    ['a created run', { kind: 'ok', runId: 'run-1' }],
    ['a copied template', { kind: 'ok', templateId: 'template-9' }],
    ['a sign-in redirect', { kind: 'login_required' }],
    ['a checkout redirect', { kind: 'upgrade_required' }],
  ])('does not follow %s once the user has left the page', async (_label, result) => {
    const spies = handlers();

    await followTemplateActionResult(result, visit(false), spies);

    expect(spies.succeeded).not.toHaveBeenCalled();
    expect(spies.loginRequired).not.toHaveBeenCalled();
    expect(spies.upgradeRequired).not.toHaveBeenCalled();
  });

  it('still reports a failure after the user left', async () => {
    const spies = handlers();

    await followTemplateActionResult({ kind: 'error', message: 'Run limit reached' }, visit(false), spies);

    expect(toastMocks.error).toHaveBeenCalledWith('Run limit reached');
  });

  it('follows each outcome while the user is still on the page', async () => {
    const spies = handlers();

    await followTemplateActionResult({ kind: 'ok', runId: 'run-1' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'login_required' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'upgrade_required' }, visit(true), spies);
    await followTemplateActionResult({ kind: 'error', message: 'Nope' }, visit(true), spies);

    expect(spies.succeeded).toHaveBeenCalledWith({ kind: 'ok', runId: 'run-1' });
    expect(spies.loginRequired).toHaveBeenCalledTimes(1);
    expect(spies.upgradeRequired).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith('Nope');
  });

  it('waits for the upgrade flow to finish', async () => {
    let finished = false;
    const spies = {
      ...handlers(),
      upgradeRequired: vi.fn(async () => {
        await Promise.resolve();
        finished = true;
      }),
    };

    await followTemplateActionResult({ kind: 'upgrade_required' }, visit(true), spies);

    expect(finished).toBe(true);
  });
});

describe('saveTemplateToAccount before the active context is known, which reads as Personal until then, so a copy would land in Personal or start Personal checkout', () => {
  const publicTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
    categories: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    id: 'template-1',
    isPublic: true,
    sections: [],
    slug: 'audit',
    tags: [],
    title: 'Audit',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'someone-else',
    version: 1,
    ...overrides,
  });

  const save = (params: {
    isPro: boolean;
    template?: ChecklistTemplate;
    workspaceStatus: 'ready' | 'loading' | 'error';
  }) => {
    const apiClient = { clonePublicTemplate: vi.fn().mockResolvedValue({ id: 'copy-1' }) };
    const createTemplate = vi.fn().mockResolvedValue(publicTemplate({ id: 'copy-2' }));
    const result = saveTemplateToAccount({
      apiClient,
      billingState: { billingEnabled: true, isError: false, isLoading: false, isPro: params.isPro },
      createTemplate,
      isAuthenticated: true,
      teamId: undefined,
      template: params.template ?? publicTemplate(),
      userId: 'user-1',
      workspaceStatus: params.workspaceStatus,
    });
    return { apiClient, createTemplate, result };
  };

  it.each([
    ['loading', true],
    ['loading', false],
    ['error', true],
    ['error', false],
  ] as const)('refuses a copy while the context is %s (Pro: %s), without cloning or checkout', async (workspaceStatus, isPro) => {
    for (const template of [publicTemplate(), publicTemplate({ id: 'repo:camping', userId: REPO_TEMPLATE_USER_ID })]) {
      const { apiClient, createTemplate, result } = save({ isPro, template, workspaceStatus });

      await expect(result).resolves.toEqual({ kind: 'error', message: WORKSPACE_NOT_READY_MESSAGE });
      expect(apiClient.clonePublicTemplate).not.toHaveBeenCalled();
      expect(createTemplate).not.toHaveBeenCalled();
    }
  });

  it('copies once the context is known', async () => {
    const { apiClient, result } = save({ isPro: true, workspaceStatus: 'ready' });

    await expect(result).resolves.toEqual({ kind: 'ok', templateId: 'copy-1' });
    expect(apiClient.clonePublicTemplate).toHaveBeenCalledWith('template-1', {
      teamId: undefined,
      visibility: 'private',
    });
  });
});

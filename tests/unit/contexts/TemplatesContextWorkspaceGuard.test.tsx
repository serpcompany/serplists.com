import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

const apiMock = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  createChecklist: vi.fn(),
  importTemplateBackup: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: apiMock }));
import { aTemplatesProviderForEachTest, launchChecklist, providerWorkspace } from '../../support/templatesProviderHarness';
import { WORKSPACE_NOT_READY_MESSAGE, type WorkspaceStatus } from '@/contexts/workspaceSelection';

const template = (overrides: Partial<ChecklistTemplate> = {}) =>
  launchChecklist({ userId: 'someone-else', isPublic: true, version: 1, ...overrides });

const renderTemplatesProvider = aTemplatesProviderForEachTest();
const renderProvider = () => renderTemplatesProvider().context;

const confirmTheWorkspace = (status: WorkspaceStatus) => {
  providerWorkspace.workspaceStatus = status;
  providerWorkspace.isWorkspaceLoading = status !== 'ready';
};

describe.each(['loading', 'error'] as const)('writes while the stored Organization is unconfirmed (%s) and the context shows Personal only for display', (status) => {
  beforeEach(() => {
    confirmTheWorkspace(status);
    apiMock.createTemplate.mockReset().mockResolvedValue({ id: 'template-2' });
    apiMock.createChecklist.mockReset().mockResolvedValue({ id: 'run-1' });
    apiMock.importTemplateBackup.mockReset().mockResolvedValue({ imported: 1 });
  });

  it('refuses a new template for the active context instead of creating it in Personal', async () => {
    const context = renderProvider();

    await expect(context.createTemplate(template())).rejects.toThrow(WORKSPACE_NOT_READY_MESSAGE);
    expect(apiMock.createTemplate).not.toHaveBeenCalled();
  });

  it('refuses to start a run of a public template in the active context', async () => {
    const context = renderProvider();

    await expect(context.createRun({ templateId: 'template-1', template: template() })).rejects.toThrow(
      WORKSPACE_NOT_READY_MESSAGE,
    );
    expect(apiMock.createChecklist).not.toHaveBeenCalled();
  });

  it('refuses an import into the active context', async () => {
    const context = renderProvider();

    await expect(context.importTemplates([template()])).rejects.toThrow(WORKSPACE_NOT_READY_MESSAGE);
    expect(apiMock.importTemplateBackup).not.toHaveBeenCalled();
  });

  it('still runs a private Organization template, which always goes to its own Organization', async () => {
    const context = renderProvider();

    const run = await context.createRun({
      templateId: 'template-1',
      template: template({ isPublic: false, teamId: 'acme' }),
    });

    expect(run?.id).toBe('run-1');
    expect(apiMock.createChecklist).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'acme' }));
  });

  it('still copies a template into an explicitly named Organization', async () => {
    const context = renderProvider();

    await context.createTemplate({ ...template(), teamId: 'acme' });

    expect(apiMock.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'acme' }));
  });
});

describe('writes once the context is known', () => {
  it('creates in Personal when Personal is the confirmed context', async () => {
    confirmTheWorkspace('ready');
    apiMock.createTemplate.mockReset().mockResolvedValue({ id: 'template-2' });
    const context = renderProvider();

    await context.createTemplate(template());

    expect(apiMock.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ teamId: undefined }));
  });
});

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiMock = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  createChecklist: vi.fn(),
  deleteTemplate: vi.fn(),
  updateChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  revalidateChecklist: vi.fn(),
  importTemplateBackup: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/api', () => ({ api: apiMock }));
import { aTemplatesProviderForEachTest, launchChecklist, savePayloadOf } from '../../support/templatesProviderHarness';
import { getTemplateSaveSuccessMessage } from '@/features/template-editor/useTemplateEditorModel';
import type { TemplatesContextProps } from '@/types/checklist';
import { buildRun } from '../../fixtures/runExecutionFixtures';

const template = launchChecklist();
const theTemplateMadePublic = { ...savePayloadOf(template), isPublic: true };

const renderTemplatesProvider = aTemplatesProviderForEachTest();
const renderProvider = () =>
  renderTemplatesProvider((client) => {
    client.setQueryData(['templates', 'user-1', 'personal'], [template]);
    client.setQueryData(['runs', 'user-1', 'personal'], []);
  });

const isInvalidated = (client: QueryClient, key: unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

const expectNoToasts = () => {
  expect(toastMock.success).not.toHaveBeenCalled();
  expect(toastMock.error).not.toHaveBeenCalled();
};

describe('TemplatesProvider mutations leave feedback to the page', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    apiMock.createTemplate.mockReset();
    apiMock.updateTemplate.mockReset();
    apiMock.createChecklist.mockReset();
  });

  it('creates a template without a toast and still refreshes the lists', async () => {
    apiMock.createTemplate.mockResolvedValue({ id: 'template-2', slug: 'launch-checklist-2' });
    const { client, context } = renderProvider();

    const created = await context.createTemplate({ ...template, title: 'Copy' });

    expect(created.id).toBe('template-2');
    expectNoToasts();
    expect(isInvalidated(client, ['templates', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed template create to the caller without a toast', async () => {
    apiMock.createTemplate.mockRejectedValue(new Error('Template limit reached'));
    const { context } = renderProvider();

    await expect(context.createTemplate({ ...template })).rejects.toThrow('Template limit reached');
    expectNoToasts();
  });

  it('updates a template (such as a visibility toggle) without a toast', async () => {
    apiMock.updateTemplate.mockResolvedValue({ id: 'template-1', version: 4 });
    const { client, context } = renderProvider();

    await context.updateTemplate(theTemplateMadePublic);

    expectNoToasts();
    expect(isInvalidated(client, ['templates', 'user-1', 'personal'])).toBe(true);
  });

  it('leaves the run lists as they are after a metadata-only save, which reconciles no runs', async () => {
    apiMock.updateTemplate.mockResolvedValue({ id: 'template-1', version: 4 });
    const { client, context } = renderProvider();

    await context.updateTemplate(theTemplateMadePublic);

    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(false);
  });

  it('refreshes the run lists when the save changed the checklist structure', async () => {
    apiMock.updateTemplate.mockResolvedValue({
      id: 'template-1',
      version: 4,
      structureChanged: true,
      reconciledRuns: 2,
    });
    const { client, context } = renderProvider();

    await context.updateTemplate(savePayloadOf(template));

    expectNoToasts();
    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed template update to the caller without a toast', async () => {
    apiMock.updateTemplate.mockRejectedValue(new Error('Version conflict'));
    const { context } = renderProvider();

    await expect(context.updateTemplate(theTemplateMadePublic)).rejects.toThrow('Version conflict');
    expectNoToasts();
  });

  it('starts a run without a toast and still marks the run lists stale', async () => {
    apiMock.createChecklist.mockResolvedValue({ id: 'run-1' });
    const { client, context } = renderProvider();

    const run = await context.createRun({ templateId: 'template-1', template });

    expect(run?.id).toBe('run-1');
    expectNoToasts();
    expect(isInvalidated(client, ['runs', 'user-1', 'personal'])).toBe(true);
  });

  it('passes a failed run start (such as the run limit) to the caller without a toast', async () => {
    apiMock.createChecklist.mockRejectedValue(new Error('Run limit reached'));
    const { context } = renderProvider();

    await expect(context.createRun({ templateId: 'template-1', template })).rejects.toThrow('Run limit reached');
    expectNoToasts();
  });
});

describe('template editor save feedback', () => {
  it('toasts once for a successful create or update, and never for a failed save, which the editor shows inline', () => {
    const ok = { success: true, errors: [] };
    const failed = { success: false, errors: [{ type: 'save', message: 'Version conflict' }] };

    expect(getTemplateSaveSuccessMessage({ result: ok })).toBe('Template created');
    expect(getTemplateSaveSuccessMessage({ id: 'template-1', result: ok })).toBe('Template saved');
    expect(getTemplateSaveSuccessMessage({ id: 'template-1', result: failed })).toBeNull();
    expect(getTemplateSaveSuccessMessage({ result: failed })).toBeNull();
  });
});

const run = buildRun({ id: 'run-1', revision: 2 });
const importSummary = { total: 1, imported: 1, failed: [], successes: [] };

const OTHER_MUTATIONS: Array<[string, keyof typeof apiMock, unknown, (context: TemplatesContextProps) => Promise<unknown>]> = [
  ['deletes a template', 'deleteTemplate', undefined, (context) => context.deleteTemplate('template-1')],
  ['saves run progress', 'updateChecklist', { revision: 3 }, (context) => context.updateRun(run)],
  ['deletes a run', 'deleteChecklist', undefined, (context) => context.deleteRun('run-1')],
  ['revalidates a run', 'revalidateChecklist', undefined, (context) => context.revalidateRun(run)],
  ['imports templates', 'importTemplateBackup', importSummary, (context) => context.importTemplates([template])],
];

describe('every other TemplatesProvider mutation leaves feedback to the page too', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it.each(OTHER_MUTATIONS)('%s without a toast, whether it succeeds or fails', async (_mutation, apiMethod, answer, mutate) => {
    apiMock[apiMethod].mockReset();
    apiMock[apiMethod].mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error('Request failed'));
    const { context } = renderProvider();

    await mutate(context);
    await expect(mutate(context)).rejects.toThrow('Request failed');
    expect(apiMock[apiMethod]).toHaveBeenCalledTimes(2);
    expectNoToasts();
  });
});

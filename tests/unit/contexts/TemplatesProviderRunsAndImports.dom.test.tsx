import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiRun } from '@/lib/schemas/apiRuns';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';

const apiMock = vi.hoisted(() => ({
  createChecklist: vi.fn<(payload: Record<string, unknown>) => Promise<{ id: string } | undefined>>(),
  createTemplate: vi.fn<(payload: Record<string, unknown>) => Promise<{ id: string; slug?: string }>>(),
  getChecklists: vi.fn(),
  getTemplates: vi.fn(),
  importTemplateBackup: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMock }));

import { aTemplatesProviderForEachTest, launchChecklist, providerWorkspace } from '../../support/templatesProviderHarness';
import { useTemplateLists } from '@/contexts/TemplatesContext';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';
import { repoTemplates } from '@/lib/repoTemplateCatalog';
import { MAX_TEMPLATES_PER_IMPORT } from '@/lib/templates/templateImportLimits';

import { firstOf } from '../../support/elements';
import { renderSettled } from '../../support/renderInTheDom';

const runRow: ApiRun = {
  id: 'run-1',
  title: 'Launch run',
  template_id: 'template-1',
  status: 'in_progress',
  user_id: 'user-1',
  items: JSON.stringify([{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }]),
  started_at: '2026-09-01T00:00:00.000Z',
  revision: 1,
};

const templateRow: ApiTemplate = {
  id: 'template-1',
  title: 'Launch Checklist',
  user_id: 'user-1',
  is_public: 0,
  items: JSON.stringify([{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }]),
};

const renderTemplatesProvider = aTemplatesProviderForEachTest();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function mountTheRunsList() {
  apiMock.getChecklists.mockResolvedValue([runRow]);
  apiMock.getTemplates.mockResolvedValue([templateRow]);
  let lists: ReturnType<typeof useTemplateLists> | undefined;
  const Probe = () => {
    lists = useTemplateLists({ runs: true, catalog: true, workspace: false });
    return null;
  };
  await renderSettled(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  return () => {
    if (!lists) throw new Error('useTemplateLists did not render');
    return lists;
  };
}

describe('TemplatesProvider run list', () => {
  it("loads the runs of the Organization the console is in, and loads them again on request", async () => {
    providerWorkspace.activeTeamId = 'team-1';
    providerWorkspace.workspaceScopeId = 'team-1';
    try {
      const lists = await mountTheRunsList();

      await waitFor(() => expect(lists().runs.map((run) => run.id)).toEqual(['run-1']));
      expect(apiMock.getChecklists).toHaveBeenCalledWith({ teamId: 'team-1' });

      await act(async () => {
        await lists().refetchRuns();
      });
      expect(apiMock.getChecklists).toHaveBeenCalledTimes(2);
    } finally {
      providerWorkspace.activeTeamId = undefined;
      providerWorkspace.workspaceScopeId = 'personal';
    }
  });

  it('reloads only the template lists the page asked for', async () => {
    const lists = await mountTheRunsList();
    await waitFor(() => expect(lists().runsLoading).toBe(false));
    apiMock.getTemplates.mockClear();

    await act(async () => {
      await lists().refetchTemplates();
    });

    expect(apiMock.getTemplates.mock.calls).toEqual([[{ scope: 'public' }]]);
  });
});

describe('TemplatesProvider createRun given only a template id', () => {
  it("starts the run from the user's own template in the loaded list", async () => {
    apiMock.createChecklist.mockResolvedValue({ id: 'run-2' });
    const { context } = renderTemplatesProvider((client) => {
      client.setQueryData(['templates', 'user-1', 'personal'], [launchChecklist()]);
    });

    const run = await context.createRun({ templateId: 'template-1' });

    expect(run?.id).toBe('run-2');
    expect(firstOf(apiMock.createChecklist.mock.calls)[0]).toMatchObject({ template_id: 'template-1', title: 'Launch Checklist' });
  });

  it('starts the run from a bundled library template, sending its checklist', async () => {
    apiMock.createChecklist.mockResolvedValue({ id: 'run-3' });
    const library = firstOf(repoTemplates);
    const { context } = renderTemplatesProvider();

    await context.createRun({ templateId: library.id });

    const [payload] = firstOf(apiMock.createChecklist.mock.calls);
    expect(payload).toMatchObject({ title: library.title });
    expect(payload).not.toHaveProperty('template_id');
  });

  it('starts a template that has no version yet at version 1', async () => {
    apiMock.createChecklist.mockResolvedValue({ id: 'run-4' });
    const template = launchChecklist({ version: undefined });
    const { context } = renderTemplatesProvider();

    const run = await context.createRun({ templateId: 'template-1', template });

    expect(run).toMatchObject({ id: 'run-4', templateVersion: 1 });
  });

  it('says the run could not be created when the API answers with no run', async () => {
    apiMock.createChecklist.mockResolvedValue(undefined);
    const { context } = renderTemplatesProvider();

    await expect(context.createRun({ templateId: 'template-1', template: launchChecklist() })).rejects.toThrow(
      'Failed to create checklist run',
    );
  });

  it('refuses a template id that is in neither list', async () => {
    const { context } = renderTemplatesProvider();

    await expect(context.createRun({ templateId: 'no-such-template' })).rejects.toThrow('Template not found');
    expect(apiMock.createChecklist).not.toHaveBeenCalled();
  });
});

describe('TemplatesProvider createTemplate', () => {
  it('creates a template with no categories or tags when the form gave none', async () => {
    apiMock.createTemplate.mockResolvedValue({ id: 'template-9', slug: 'quick-list' });
    const { context } = renderTemplatesProvider();

    const created = await context.createTemplate({ title: 'Quick list', sections: [], isPublic: false });

    expect(firstOf(apiMock.createTemplate.mock.calls)[0]).toMatchObject({ title: 'Quick list', is_public: false, categories: [], tags: [] });
    expect(created).toMatchObject({ id: 'template-9', slug: 'quick-list', isPublic: false, categories: [], tags: [], description: '' });
  });
});

describe('TemplatesProvider importTemplates', () => {
  it("keeps each imported template's own visibility unless the import says otherwise", async () => {
    apiMock.importTemplateBackup.mockResolvedValue({ total: 1, imported: 1, failed: [] });
    const { context } = renderTemplatesProvider();

    await context.importTemplates([launchChecklist()]);

    expect(firstOf(apiMock.importTemplateBackup.mock.calls)[0]).toMatchObject({ options: { visibility: 'preserve' } });
  });

  it('imports every template with the visibility the import chose', async () => {
    apiMock.importTemplateBackup.mockResolvedValue({ total: 1, imported: 1, failed: [] });
    const { context } = renderTemplatesProvider();

    await context.importTemplates([launchChecklist()], { visibility: 'private' });

    expect(firstOf(apiMock.importTemplateBackup.mock.calls)[0]).toMatchObject({ options: { visibility: 'private' } });
  });

  it(`refuses more than ${MAX_TEMPLATES_PER_IMPORT} templates in one file without sending any`, async () => {
    const { context } = renderTemplatesProvider();
    const tooMany = Array.from({ length: MAX_TEMPLATES_PER_IMPORT + 1 }, (_, index) => launchChecklist({ id: `template-${index}` }));

    await expect(context.importTemplates(tooMany)).rejects.toThrow(
      `Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`,
    );
    expect(apiMock.importTemplateBackup).not.toHaveBeenCalled();
  });
});

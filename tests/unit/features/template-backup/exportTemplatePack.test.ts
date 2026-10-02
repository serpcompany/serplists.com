import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  EXPORT_PACK_UNREADABLE_MESSAGE,
  exportTemplatePack,
} from '@/features/template-backup/exportTemplatePack';
import { getAccessFailure } from '@/lib/api-errors';
import { createSingleFlight } from '@/lib/utils/singleFlight';
import { portableTemplatePackSchema } from '@/lib/schemas/checklistSchema';
import type { ExportedTemplatePack } from '@/lib/schemas/apiTemplates';
import { buildPortableTemplatePack } from '@functions/api/utils/template-portable';
import { firstOf } from '../../../support/elements';

const pack = (templates: unknown[]) => ({
  kind: 'serplists-template-pack',
  templates,
});

const buildDependencies = (response: unknown, catalog: unknown[] = []) => ({
  download: vi.fn<(pack: ExportedTemplatePack) => void>(),
  exportBackup: vi.fn().mockResolvedValue(response),
  loadPublicCatalog: vi.fn().mockResolvedValue(catalog),
});

describe('exportTemplatePack', () => {
  it("asks the server for the context's own templates even when the loaded list looks empty, as a failed list request also does", async () => {
    const dependencies = buildDependencies(pack([{ title: 'Owned' }]));

    const result = await exportTemplatePack({ includePublic: false, teamId: 'team-1' }, dependencies);

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(dependencies.loadPublicCatalog).not.toHaveBeenCalled();
    expect(result).toEqual({ exported: 1, skipped: [] });
  });

  it('reports nothing to export without downloading when the server returns no templates', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack({ includePublic: false }, dependencies);

    expect(dependencies.exportBackup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ exported: 0, skipped: [] });
    expect(dependencies.download).not.toHaveBeenCalled();
  });

  it('loads the public catalog for an export that asks for public templates, and downloads no empty pack', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack(
      { includePublic: true },
      dependencies,
    );

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ teamId: undefined });
    expect(dependencies.loadPublicCatalog).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ exported: 0, skipped: [] });
    expect(dependencies.download).not.toHaveBeenCalled();
  });

  it('downloads the server pack and reports how many templates it holds', async () => {
    const response = pack([{ title: 'Owned' }, { title: 'Public' }]);
    const dependencies = buildDependencies(response);

    const result = await exportTemplatePack(
      { includePublic: true },
      dependencies,
    );

    expect(dependencies.download).toHaveBeenCalledWith(response);
    expect(result).toEqual({ exported: 2, skipped: [] });
  });

  it('rejects a response that is not a template pack with a readable message, which the page toasts as-is', async () => {
    const dependencies = buildDependencies({ error: 'unexpected' });

    const error = await exportTemplatePack({ includePublic: false }, dependencies).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ZodError);
    const { message } = getAccessFailure(error, 'Failed to export templates');
    expect(message).toBe(EXPORT_PACK_UNREADABLE_MESSAGE);
    expect(message).not.toMatch(/[{}[\]\n]/);
    expect(dependencies.download).not.toHaveBeenCalled();
  });
});

describe("exportTemplatePack with public templates in an Organization, whose catalog rows carry no team_id to tell its own apart", () => {
  const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];
  const stored = (slug: string, title: string) => ({
    id: `${slug}-id`, title, description: '', type: 'checklist', seoTitle: '', seoDescription: '',
    sections, categories: [], tags: [], isPublic: true, slug,
  });
  const catalogRow = (id: string, slug: string, title: string, ownerType: 'team' | 'user') => ({
    id, title, description: '', sections, userId: 'someone', ownerType, isPublic: true, slug,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', categories: [], tags: [],
  });

  it("adds each public template once, even when the page list is empty, as one that failed to load or predates a teammate's template is", async () => {
    const serverPack: unknown = JSON.parse(JSON.stringify(buildPortableTemplatePack(
      [stored('org-guide', 'Org guide'), stored('launch-qa', 'Launch QA')],
      'admin@example.com',
    )));
    const dependencies = buildDependencies(serverPack, [
      catalogRow('org-guide-id', 'org-guide', 'Org guide', 'team'),
      catalogRow('launch-qa-id', 'launch-qa', 'Launch QA', 'team'),
      catalogRow('community-id', 'community', 'Community', 'user'),
    ]);

    const result = await exportTemplatePack(
      { includePublic: true, teamId: 'org-1', userId: 'user-1', ownedTemplateIds: [] },
      dependencies,
    );

    const downloaded = portableTemplatePackSchema.parse(firstOf(dependencies.download.mock.calls)[0]);
    expect(downloaded.templates.map((entry) => entry.slug)).toEqual(['org-guide', 'launch-qa', 'community']);
    expect(downloaded.manifest?.totalTemplates).toBe(3);
    expect(result).toEqual({ exported: 3, skipped: [] });
  });
});

describe('exportTemplatePack behind the page export guard', () => {
  it('sends one request and downloads one file for a double click', async () => {
    let resolveExport!: (value: unknown) => void;
    const exportBackup = vi.fn(
      () => new Promise<unknown>((resolve) => {
        resolveExport = resolve;
      }),
    );
    const download = vi.fn();
    const flight = createSingleFlight();
    const click = () =>
      flight.run(() => exportTemplatePack({ includePublic: true }, { download, exportBackup }));

    const first = click();
    const second = click();
    resolveExport(pack([{ title: 'Owned' }, { title: 'Public' }]));

    await expect(first).resolves.toEqual({ exported: 2, skipped: [] });
    await expect(second).resolves.toBeUndefined();
    expect(exportBackup).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });
});

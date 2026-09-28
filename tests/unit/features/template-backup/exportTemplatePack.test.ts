import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  EXPORT_PACK_UNREADABLE_MESSAGE,
  exportTemplatePack,
} from '@/features/template-backup/exportTemplatePack';
import { getAccessFailure } from '@/lib/api-errors';
import { createSingleFlight } from '@/lib/utils/singleFlight';

const pack = (templates: unknown[]) => ({
  kind: 'serplists-template-pack',
  templates,
});

const buildDependencies = (response: unknown, catalog: unknown[] = []) => ({
  download: vi.fn(),
  exportBackup: vi.fn().mockResolvedValue(response),
  loadPublicCatalog: vi.fn().mockResolvedValue(catalog),
});

describe('exportTemplatePack', () => {
  it('lets the server decide even when the loaded list looks empty', async () => {
    // A failed list request also looks like an empty list, so the page never guesses.
    const dependencies = buildDependencies(pack([{ title: 'Owned' }]));

    const result = await exportTemplatePack({ includePublic: false, teamId: 'team-1' }, dependencies);

    // The server exports only the context's own templates.
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

  it('does not download an empty pack when public templates were requested', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack(
      { includePublic: true },
      dependencies,
    );

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ teamId: undefined });
    // Public templates come from the catalog, loaded only for this export.
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

  it('rejects a response that is not a template pack with a readable message', async () => {
    const dependencies = buildDependencies({ error: 'unexpected' });

    const error = await exportTemplatePack({ includePublic: false }, dependencies).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ZodError);
    // The page toasts this message as-is (getAccessFailure falls back to it).
    const { message } = getAccessFailure(error, 'Failed to export templates');
    expect(message).toBe(EXPORT_PACK_UNREADABLE_MESSAGE);
    expect(message).not.toMatch(/[{}[\]\n]/);
    expect(dependencies.download).not.toHaveBeenCalled();
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

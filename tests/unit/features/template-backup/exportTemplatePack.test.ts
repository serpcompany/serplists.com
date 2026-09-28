import { describe, expect, it, vi } from 'vitest';

import { exportTemplatePack } from '@/features/template-backup/exportTemplatePack';

const pack = (templates: unknown[]) => ({
  kind: 'serplists-template-pack',
  templates,
});

const buildDependencies = (response: unknown) => ({
  download: vi.fn(),
  exportBackup: vi.fn().mockResolvedValue(response),
});

describe('exportTemplatePack', () => {
  it('lets the server decide even when the loaded list looks empty', async () => {
    // A failed list request also looks like an empty list, so the page never guesses.
    const dependencies = buildDependencies(pack([{ title: 'Owned' }]));

    const result = await exportTemplatePack({ includePublic: false, teamId: 'team-1' }, dependencies);

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ includePublic: false, teamId: 'team-1' });
    expect(result).toEqual({ kind: 'exported', count: 1 });
  });

  it('reports nothing to export without downloading when the server returns no templates', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack({ includePublic: false }, dependencies);

    expect(dependencies.exportBackup).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'empty' });
    expect(dependencies.download).not.toHaveBeenCalled();
  });

  it('does not download an empty pack when public templates were requested', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack(
      { includePublic: true },
      dependencies,
    );

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ includePublic: true, teamId: undefined });
    expect(result).toEqual({ kind: 'empty' });
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
    expect(result).toEqual({ kind: 'exported', count: 2 });
  });

  it('rejects a response that is not a template pack', async () => {
    const dependencies = buildDependencies({ error: 'unexpected' });

    await expect(
      exportTemplatePack({ includePublic: false }, dependencies),
    ).rejects.toThrow();
    expect(dependencies.download).not.toHaveBeenCalled();
  });
});

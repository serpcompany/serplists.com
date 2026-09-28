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
  it('reports nothing to export without calling the API when the loaded context has no templates', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack(
      { includePublic: false, knownOwnedCount: 0 },
      dependencies,
    );

    expect(result).toEqual({ kind: 'empty' });
    expect(dependencies.exportBackup).not.toHaveBeenCalled();
    expect(dependencies.download).not.toHaveBeenCalled();
  });

  it('asks the server while the template list is still loading instead of guessing empty', async () => {
    const dependencies = buildDependencies(pack([{ title: 'Owned' }]));

    const result = await exportTemplatePack(
      { includePublic: false, knownOwnedCount: null, teamId: 'team-1' },
      dependencies,
    );

    expect(dependencies.exportBackup).toHaveBeenCalledWith({ includePublic: false, teamId: 'team-1' });
    expect(result).toEqual({ kind: 'exported', count: 1 });
  });

  it('does not download an empty pack when public templates were requested', async () => {
    const dependencies = buildDependencies(pack([]));

    const result = await exportTemplatePack(
      { includePublic: true, knownOwnedCount: 0 },
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
      { includePublic: true, knownOwnedCount: 1 },
      dependencies,
    );

    expect(dependencies.download).toHaveBeenCalledWith(response);
    expect(result).toEqual({ kind: 'exported', count: 2 });
  });

  it('rejects a response that is not a template pack', async () => {
    const dependencies = buildDependencies({ error: 'unexpected' });

    await expect(
      exportTemplatePack({ includePublic: false, knownOwnedCount: 2 }, dependencies),
    ).rejects.toThrow();
    expect(dependencies.download).not.toHaveBeenCalled();
  });
});

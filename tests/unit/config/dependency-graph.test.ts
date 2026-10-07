import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { arrayContaining } from '../../support/asymmetricMatchers';

const repoRoot = process.cwd();

const cruiseResult = z.object({
  modules: z.array(
    z.object({
      source: z.string(),
      dependencies: z.array(z.object({ module: z.string(), dependencyTypes: z.array(z.string()) })),
    }),
  ),
});

const dependenciesOf = (file: string) => {
  const cruise = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'), '--config', '.dependency-cruiser.cjs', '--output-type', 'json', file],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (cruise.error) throw cruise.error;
  const graph = cruiseResult.parse(JSON.parse(cruise.stdout));
  return graph.modules.find((module) => module.source === file)?.dependencies ?? [];
};

describe('the dependency graph pnpm run deps:check reads', { timeout: 60_000 }, () => {
  it('keeps npm packages built into a dist folder, so the rules about packages can see them', () => {
    expect(dependenciesOf('src/components/ui/button-variants.ts').map((dependency) => dependency.module)).toEqual(
      arrayContaining(['class-variance-authority', 'cn']),
    );
  });

  it('marks an import of a devDependency as one, which the rule against them in runtime code reads', () => {
    expect(dependenciesOf('scripts/lib/portableTemplateJsonSchema.ts')).toContainEqual({
      module: 'zod-to-json-schema',
      dependencyTypes: arrayContaining(['npm-dev']),
    });
  });
});

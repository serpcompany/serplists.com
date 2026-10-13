import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cruise, cruisedPaths, dependencyConfig } from '../../../scripts/checks/dependencies';

const repoRoot = process.cwd();
const CONFIG = path.join(repoRoot, dependencyConfig);
const LAYERS_SECTION = '(ARCHITECTURE.md, Layers)';
const FOLDERS_THE_LAYERS_NAME = ['src', 'functions', 'db'];

const forbiddenRules = z
  .object({ forbidden: z.array(z.object({ name: z.string(), comment: z.string() })) })
  .parse(createRequire(import.meta.url)(CONFIG)).forbidden;
const layerRules = forbiddenRules.filter((rule) => rule.comment.endsWith(`${LAYERS_SECTION}.`));

type Tree = Record<string, string[]>;

const LAYERED_TREE: Tree = {
  'src/app/page.tsx': ['src/views/Home.tsx', 'src/views/NotFound.tsx', 'src/server/meta.ts', 'functions/api/[[route]].ts'],
  'src/app/layout.tsx': [],
  'src/views/Home.tsx': ['src/components/Gate.tsx', 'src/components/TeamList.tsx', 'src/lib/format.ts'],
  'src/views/NotFound.tsx': [],
  'src/components/Gate.tsx': [
    'src/components/ui/button.tsx',
    'src/features/teams/useTeams.ts',
    'src/contexts/Workspace.tsx',
    'src/hooks/useIsClient.ts',
  ],
  'src/components/TeamList.tsx': [],
  'src/components/ui/button.tsx': ['src/lib/format.ts'],
  'src/features/teams/useTeams.ts': ['src/lib/api.ts'],
  'src/contexts/Workspace.tsx': ['src/features/teams/useTeams.ts'],
  'src/hooks/useIsClient.ts': ['src/lib/format.ts'],
  'src/lib/api.ts': ['src/lib/format.ts'],
  'src/lib/format.ts': [],
  'src/lib/schemas/template.ts': [],
  'src/server/meta.ts': ['src/features/teams/useTeams.ts', 'src/lib/format.ts', 'functions/seo/lookup.ts'],
  'functions/api/[[route]].ts': ['functions/api/handlers/templates.ts', 'functions/api/utils/logger.ts'],
  'functions/api/handlers/templates.ts': ['functions/api/utils/session.ts'],
  'functions/api/utils/session.ts': [
    'functions/api/db.ts',
    'functions/api/utils/audit.ts',
    'functions/api/utils/logger.ts',
    'src/lib/schemas/template.ts',
  ],
  'functions/api/utils/audit.ts': [],
  'functions/api/db.ts': [
    'db/schema/index.ts',
    'functions/api/types.ts',
    'functions/api/utils/logger.ts',
    'functions/api/utils/d1-profiler.ts',
  ],
  'functions/api/types.ts': [],
  'functions/api/utils/logger.ts': ['functions/api/utils/request-context.ts'],
  'functions/api/utils/request-context.ts': [],
  'functions/api/utils/d1-profiler.ts': [],
  'functions/seo/lookup.ts': ['functions/api/db.ts', 'functions/api/utils/session.ts'],
  'db/schema/index.ts': [],
};

type BrokenImport = { rule: string; from: string; to: string; importedBy?: string };

const BROKEN_IMPORTS: BrokenImport[] = [
  { rule: 'api-imports-only-shared-src', from: 'functions/api/utils/slugs.ts', to: 'src/lib/format.ts', importedBy: 'functions/api/utils/session.ts' },
  { rule: 'shared-src-stays-framework-free', from: 'src/lib/schemas/run.ts', to: 'src/lib/api.ts', importedBy: 'src/app/page.tsx' },
  { rule: 'app-does-not-import-api-runtime', from: 'src/hooks/useWorkerTypes.ts', to: 'functions/api/types.ts', importedBy: 'src/views/Home.tsx' },
  { rule: 'client-code-does-not-import-server-modules', from: 'src/views/Profile.tsx', to: 'src/server/meta.ts', importedBy: 'src/app/page.tsx' },
  { rule: 'views-import-no-route', from: 'src/views/Settings.tsx', to: 'src/app/layout.tsx', importedBy: 'src/app/page.tsx' },
  { rule: 'components-import-no-route-or-view', from: 'src/components/OrganizationGate.tsx', to: 'src/views/NotFound.tsx', importedBy: 'src/views/Home.tsx' },
  { rule: 'features-contexts-and-hooks-import-no-screen', from: 'src/features/teams/useInvites.ts', to: 'src/components/TeamList.tsx', importedBy: 'src/views/Home.tsx' },
  { rule: 'lib-builds-on-nothing-above-it', from: 'src/lib/teamLabels.ts', to: 'src/hooks/useIsClient.ts', importedBy: 'src/views/Home.tsx' },
  { rule: 'server-imports-no-route-or-view', from: 'src/server/pageMeta.ts', to: 'src/views/NotFound.tsx', importedBy: 'src/app/page.tsx' },
  { rule: 'screens-do-not-call-transport', from: 'src/views/Runs.tsx', to: 'src/lib/api.ts', importedBy: 'src/app/page.tsx' },
  { rule: 'ui-primitives-stay-presentational', from: 'src/components/ui/dialog.tsx', to: 'src/hooks/useIsClient.ts', importedBy: 'src/components/Gate.tsx' },
  { rule: 'handlers-import-no-router', from: 'functions/api/handlers/billing.ts', to: 'functions/api/[[route]].ts', importedBy: 'src/app/billing/route.ts' },
  { rule: 'api-services-import-no-handler-or-router', from: 'functions/api/utils/entitlements.ts', to: 'functions/api/handlers/templates.ts', importedBy: 'src/app/entitlements/route.ts' },
  { rule: 'db-module-builds-only-on-the-schema', from: 'functions/api/db.ts', to: 'functions/api/utils/audit.ts' },
  { rule: 'observability-imports-no-other-api-code', from: 'functions/api/utils/request-context.ts', to: 'functions/api/utils/audit.ts' },
  { rule: 'db-schema-is-a-leaf', from: 'db/schema/templates.ts', to: 'functions/api/utils/audit.ts', importedBy: 'db/schema/index.ts' },
];

const withBrokenImports = (tree: Tree): Tree => {
  const broken: Tree = Object.fromEntries(Object.entries(tree).map(([file, imports]) => [file, [...imports]]));
  for (const { from, to, importedBy } of BROKEN_IMPORTS) {
    broken[from] = [...(broken[from] ?? []), to];
    if (importedBy) broken[importedBy] = [...(broken[importedBy] ?? []), from];
  }
  return broken;
};

const specifier = (from: string, to: string) => {
  const relative = path.posix.relative(path.posix.dirname(from), to.replace(/\.tsx?$/, ''));
  return relative.startsWith('.') ? relative : `./${relative}`;
};

const directories: string[] = [];

const findingsFor = (tree: Tree) => {
  const root = mkdtempSync(path.join(tmpdir(), 'layer-rules-'));
  directories.push(root);
  writeFileSync(path.join(root, 'tsconfig.json'), '{ "compilerOptions": { "jsx": "react-jsx" } }\n');
  for (const [file, imports] of Object.entries(tree)) {
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    const lines = imports.map((target) => `import '${specifier(file, target)}';`);
    writeFileSync(path.join(root, file), [...lines, 'export const value = 1;', ''].join('\n'));
  }
  const findings = cruise(root, CONFIG, cruisedPaths.filter((entry) => existsSync(path.join(root, entry))));
  return stripVTControlCharacters(findings.join('\n')).replace(/\s+/g, ' ').trim();
};

afterAll(() => {
  for (const created of directories.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe('the layer rules pnpm run verify dependencies checks', { timeout: 60_000 }, () => {
  it('are the rules in .dependency-cruiser.cjs, run over every folder they name', () => {
    expect(CONFIG).toBe(path.join(repoRoot, '.dependency-cruiser.cjs'));
    expect(FOLDERS_THE_LAYERS_NAME.filter((folder) => !cruisedPaths.includes(folder))).toEqual([]);
  });

  it('pass a tree whose imports follow every arrow in ARCHITECTURE.md, observability below db.ts included', () => {
    expect(findingsFor(LAYERED_TREE)).toBe('');
  });

  const broken = findingsFor(withBrokenImports(LAYERED_TREE));

  it.each(BROKEN_IMPORTS)('refuse an import against $rule, naming both files and where the code belongs', ({ rule, from, to }) => {
    const comment = forbiddenRules.find((each) => each.name === rule)?.comment ?? `no rule named ${rule}`;

    expect(broken).toContain(`error ${rule}: ${from} → ${to} ${comment}`);
  });

  it('report each broken import once, under one rule', () => {
    expect(broken).toContain(`${BROKEN_IMPORTS.length} dependency violations (${BROKEN_IMPORTS.length} errors, 0 warnings)`);
  });

  it('prove every layer rule, which each name ARCHITECTURE.md as where its layers are drawn, with an import it refuses', () => {
    expect(layerRules.map((rule) => rule.name).sort()).toEqual(BROKEN_IMPORTS.map((each) => each.rule).sort());
  });
});

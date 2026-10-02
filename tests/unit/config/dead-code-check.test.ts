import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const repoRoot = process.cwd();
const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'));

const KNIP_CONFIG = 'knip.json';
const OTHER_KNIP_CONFIGS = ['.knip.json', 'knip.jsonc', '.knip.jsonc'].concat(
  ['knip', 'knip.config'].flatMap((name) => ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((extension) => `${name}.${extension}`)),
);
const ALLOWED_IGNORED_DEPENDENCIES = ['@secretlint/secretlint-rule-preset-recommend'];
const ALLOWED_IGNORED_BINARIES = ['stripe'];
const SETTINGS = ['$schema', 'entry', 'project', 'ignoreDependencies', 'ignoreBinaries', 'treatConfigHintsAsErrors'];

const packageJson = z
  .object({ scripts: z.object({ 'check:repo': z.string(), 'deadcode:check': z.string() }).catchall(z.string()) })
  .passthrough()
  .parse(readJson('package.json'));

const storedConfig = z.record(z.unknown()).parse(readJson(KNIP_CONFIG));
const patterns = z.array(z.string()).default([]);
const config = z
  .object({
    entry: patterns,
    project: patterns,
    ignoreDependencies: patterns,
    ignoreBinaries: patterns,
    treatConfigHintsAsErrors: z.boolean().default(false),
  })
  .passthrough()
  .parse(storedConfig);

const knipPluginNames = Object.keys(
  z
    .object({ definitions: z.object({ plugins: z.object({ properties: z.record(z.unknown()) }) }) })
    .parse(readJson('node_modules/knip/schema.json')).definitions.plugins.properties,
);
const pluginSettings = z.object({ config: patterns, entry: patterns, project: patterns }).strict();
const pluginsConfigured = Object.keys(storedConfig).filter((key) => !SETTINGS.includes(key));

describe('pnpm run deadcode:check', () => {
  it('runs in check:repo as plain knip, so every kind of dead code it finds fails verify and CI', () => {
    expect(packageJson.scripts['check:repo'].split('&&').map((command) => command.trim())).toContain(
      'pnpm run deadcode:check',
    );
    expect(
      packageJson.scripts['deadcode:check'],
      'deadcode:check must be "knip" with no flags and no "|| true": --include, --exclude, --production, ' +
        '--max-issues and --no-exit-code each let dead code pass. Settings belong in knip.json.',
    ).toBe('knip');
  });

  it('reads its settings only from knip.json, where they are checked', () => {
    expect(
      OTHER_KNIP_CONFIGS.filter((file) => existsSync(path.join(repoRoot, file))),
      'knip reads the first config file it finds, so a second one would replace knip.json. Delete it.',
    ).toEqual([]);
    expect(Object.keys(packageJson), 'Remove the "knip" key from package.json: knip.json holds the settings.').not.toContain(
      'knip',
    );
  });

  it('reports unused files, dependencies, unlisted dependencies, unused exports and types, and duplicate exports, with no issue type turned off', () => {
    expect(
      pluginsConfigured.filter((key) => !knipPluginNames.includes(key)),
      `knip.json may set only ${SETTINGS.join(', ')} and plugin entry points. "rules", "include" and "exclude" ` +
        'turn issue types off, and "ignore", "ignoreFiles", "ignoreMembers", "ignoreUnresolved", ' +
        '"ignoreExportsUsedInFile", "ignoreIssues" and "tags" hide what knip finds. Delete the dead code instead.',
    ).toEqual([]);
    for (const plugin of pluginsConfigured) {
      expect(
        pluginSettings.safeParse(storedConfig[plugin]).success,
        `knip.json "${plugin}" may only name the plugin's config files and entry points: "false" turns the plugin ` +
          'off, and any other setting changes what it reports.',
      ).toBe(true);
    }
  });

  it('defines entry points without carving files out of the analysis', () => {
    const everyPattern = [config.entry, config.project, ...pluginsConfigured.map((plugin) => {
      const settings = pluginSettings.safeParse(storedConfig[plugin]).data;
      return [...(settings?.config ?? []), ...(settings?.entry ?? []), ...(settings?.project ?? [])];
    })].flat();
    expect(
      everyPattern.filter((pattern) => pattern.startsWith('!')),
      'A negated pattern takes files out of the analysis, so dead code in them passes. Delete the dead code instead.',
    ).toEqual([]);
  });

  it('ignores only the preset secretlint loads by name and the Stripe CLI, which comes from outside npm', () => {
    expect(
      config.ignoreDependencies.filter((name) => !ALLOWED_IGNORED_DEPENDENCIES.includes(name)),
      'Only @secretlint/secretlint-rule-preset-recommend may be ignored: secretlint loads it by name from ' +
        '.secretlintrc.json, where knip cannot see it. Remove the package nothing imports, or import it.',
    ).toEqual([]);
    expect(
      config.ignoreBinaries.filter((name) => !ALLOWED_IGNORED_BINARIES.includes(name)),
      'Only the stripe binary may be ignored: it is the Stripe CLI, installed outside npm. Add the package that ' +
        'ships the binary as a devDependency instead.',
    ).toEqual([]);
  });

  it('fails when an entry point matches nothing or an ignore is no longer needed, so the ignore lists only shrink', () => {
    expect(
      config.treatConfigHintsAsErrors,
      'Keep "treatConfigHintsAsErrors": true in knip.json: knip then fails on an entry pattern that matches no file ' +
        'and on an ignored dependency or binary nothing uses any more.',
    ).toBe(true);
  });
});

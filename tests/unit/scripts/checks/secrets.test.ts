import { describe, expect, it } from 'vitest';

import { findSecrets } from '../../../../scripts/checks/secrets';
import { scratchFolder, writeFiles } from './scratch';

const githubToken = ['gh', 'p_', 'wWPw5k4aXcaT4fNP0UcnZwJUVFk6LO0pINUx'].join('');

async function secretsIn(files: Readonly<Record<string, string | Buffer>>, requested = Object.keys(files)) {
  const root = scratchFolder('secrets');
  writeFiles(root, files);
  return findSecrets(root, requested);
}

describe('the secret check', { timeout: 60_000 }, () => {
  it('finds a GitHub token, names its file and line, and masks it', async () => {
    const report = await secretsIn({ 'src/config.ts': `const site = 'serp';\nconst token = '${githubToken}';\n` });
    expect(report[0]).toBe('src/config.ts');
    expect(report.join('\n')).toMatch(/2:\d+\s+error\s+\[GITHUB_TOKEN\]/);
    expect(report.join('\n')).not.toContain(githubToken);
  });

  it('finds secrets in every route file passed together, names with brackets included', async () => {
    const report = await secretsIn({
      'functions/api/[[route]].ts': `export const a = '${githubToken}';\n`,
      'functions/sitemaps/pages/[page].xml.ts': `export const b = '${githubToken}';\n`,
      'functions/api/db.ts': 'export const ok = true;\n',
    });
    expect(report).toEqual(expect.arrayContaining(['functions/api/[[route]].ts', 'functions/sitemaps/pages/[page].xml.ts']));
  });

  it('passes a file with no credential, a path that is gone, and a binary file', async () => {
    expect(await secretsIn({ 'src/clean.ts': "export const site = 'serplists.com';\n" })).toEqual([]);
    expect(await secretsIn({ 'src/clean.ts': 'export {};\n' }, ['src/deleted.ts'])).toEqual([]);
    expect(await secretsIn({ 'public/icon.png': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(githubToken)]) })).toEqual([]);
  });
});

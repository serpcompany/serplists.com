import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { root } from '../../../../scripts/checks/files';
import {
  CLOUDFLARE_TYPES,
  firstDifferentLine,
  generatorChecks,
  scriptCommand,
  staleCloudflareTypes,
  staleGenerator,
} from '../../../../scripts/checks/generated';
import { scratchFolder, writeFiles } from './scratch';

const packageScripts = z.object({ scripts: z.record(z.string()) }).parse(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))).scripts;

describe('the generated files check', () => {
  it('runs each generator check package.json defines, and names a fix script that exists', () => {
    for (const { check, fix } of generatorChecks) {
      expect(scriptCommand(root, check).script, check).toMatch(/^scripts\/.+\.ts$/);
      expect(packageScripts[fix], fix).toBeDefined();
    }
    expect(packageScripts['cf-typegen']).toBe(`wrangler types --env-interface CloudflareEnv ./${CLOUDFLARE_TYPES}`);
  });

  it('fails a generator whose check finds its output stale, naming the command that writes it', { timeout: 60_000 }, () => {
    const at = scratchFolder('generated');
    writeFiles(at, {
      'package.json': '{ "scripts": { "thing:check": "node --import tsx scripts/thing.ts --check" } }\n',
      'scripts/thing.ts': "console.log('docs/thing.md is stale');\nprocess.exit(process.argv.includes('--check') ? 1 : 0);\n",
    });
    expect(staleGenerator(at, 'thing:check', 'thing:generate')).toBe(
      'pnpm run thing:check failed: run pnpm run thing:generate and commit what it writes.\ndocs/thing.md is stale',
    );
  });

  it('refuses a package script it cannot run without a package manager', () => {
    const at = scratchFolder('generated');
    writeFiles(at, { 'package.json': '{ "scripts": { "thing:check": "pnpm exec thing --check" } }\n' });
    expect(() => scriptCommand(at, 'thing:check')).toThrow(/must be "node --import tsx <script> \[arguments\]"/);
  });

  it('compares the Worker types it regenerates line by line, line endings aside', () => {
    expect(firstDifferentLine('a\nb\nc\n', 'a\r\nb\r\nc\r\n')).toBeUndefined();
    expect(firstDifferentLine('a\nb\nc\n', 'a\nB\nc\n')).toBe(2);
    expect(firstDifferentLine('a\nb\n', 'a\nb\nc\n')).toBe(3);
  });

  it('fails Worker types that differ from what wrangler types writes, naming the first different line', () => {
    const at = scratchFolder('generated');
    writeFiles(at, { [CLOUDFLARE_TYPES]: 'interface CloudflareEnv {\n\tDB: D1Database;\n}\n' });
    expect(staleCloudflareTypes(at, () => 'interface CloudflareEnv {\r\n\tDB: D1Database;\r\n}\r\n')).toBeUndefined();
    expect(staleCloudflareTypes(at, () => 'interface CloudflareEnv {\n\tDB: D1Database;\n\tR2_UPLOADS: R2Bucket;\n}\n')).toMatch(
      /^cloudflare-env\.d\.ts:3 {2}differs from what wrangler types writes from wrangler\.toml and the \.dev\.vars pnpm run setup creates: run pnpm run cf-typegen/,
    );
  });
});

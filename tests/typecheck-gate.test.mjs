import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const projects = ['tsconfig.app.json', 'tsconfig.worker.json', 'tsconfig.node.json'];
let copy;

function runCommand() {
  return spawnSync('pnpm', ['run', 'typecheck'], {
    cwd: copy, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function filesBelow(directory) {
  return readdirSync(path.join(copy, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(relative) : /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [relative] : [];
  });
}

function snapshot(directory = '') {
  return readdirSync(path.join(copy, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? snapshot(relative) : [[relative, createHash('sha256').update(readFileSync(path.join(copy, relative))).digest('hex')]];
  });
}

function compilerFiles() {
  return new Set(projects.flatMap((project) => {
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', project, '--listFilesOnly'], {
      cwd: copy, encoding: 'utf8', timeout: 30_000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return result.stdout.trim().split('\n').map((file) => path.relative(copy, file).split(path.sep).join('/'));
  }));
}

function assertCoverage() {
  const listed = compilerFiles();
  const intended = ['src', 'functions', 'db', 'scripts'].flatMap(filesBelow);
  intended.push(...readdirSync(copy).filter((file) => file.endsWith('.config.ts')));
  expect(intended.length).toBeGreaterThan(100);
  expect(intended.filter((file) => !listed.has(file)), 'source/config omitted from compiler file lists').toEqual([]);
}

describe('mandatory package typecheck', () => {
  beforeAll(() => {
    // macOS resolves /var to /private/var in compiler file lists. Compare
    // canonical paths so the inclusion check measures files, not that alias.
    copy = realpathSync(mkdtempSync(path.join(tmpdir(), 'serplists-type-gate-')));
    for (const directory of ['src', 'functions', 'db', 'scripts']) cpSync(path.join(root, directory), path.join(copy, directory), { recursive: true });
    for (const file of readdirSync(root).filter((file) => /^tsconfig.*\.json$/.test(file) || file.endsWith('.config.ts') || file === 'package.json')) {
      cpSync(path.join(root, file), path.join(copy, file));
    }
    symlinkSync(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'dir');
  });
  afterAll(() => { if (copy) rmSync(copy, { recursive: true, force: true }); });

  it('checks real projects without generated source or compiler cache', () => {
    const before = snapshot();
    const result = runCommand();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    assertCoverage();
    expect(snapshot(), 'typecheck must not emit or mutate source/cache files').toEqual(before);
  }, 120_000);

  it.each([
    ['src/__type_gate_probe.ts', 'export const applicationProbe: string = 135;'],
    ['functions/__type_gate_probe.ts', "import { createDb, schema } from './api/db';\nexport const workerProbe = (db: ReturnType<typeof createDb>) => db.select({ missing: schema.templates.__nonexistent_issue135_column }).from(schema.templates);"],
    ['scripts/data/__type_gate_probe.ts', 'export const toolingProbe: number = "invalid";'],
    ['issue135.config.ts', 'export const configProbe: boolean = "invalid";'],
  ])('fails the actual command for %s', (file, source) => {
    const target = path.join(copy, file);
    writeFileSync(target, source);
    try {
      const result = runCommand();
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toContain(file);
      expect(result.stdout + result.stderr).toMatch(/error TS\d+/);
    } finally { rmSync(target); }
  }, 120_000);

  it.each([
    ['tsconfig.app.json', ['src/main.tsx']],
    ['tsconfig.worker.json', ['functions/api/db.ts']],
    ['tsconfig.node.json', ['vite.config.ts']],
  ])('detects source/config omission in %s', (config, include) => {
    const target = path.join(copy, config);
    const original = readFileSync(target, 'utf8');
    // App/node configurations contain comments; retain the real options and replace only inclusion.
    writeFileSync(target, original.replace(/"include"\s*:\s*\[[^\]]*\]/, `"include": ${JSON.stringify(include)}`));
    try { expect(() => assertCoverage()).toThrow(/source\/config omitted/); }
    finally { writeFileSync(target, original); }
  }, 120_000);

  it('rejects the original root-reference-only command with an application error', () => {
    const packagePath = path.join(copy, 'package.json');
    const original = readFileSync(packagePath, 'utf8');
    const manifest = JSON.parse(original);
    manifest.scripts.typecheck = 'tsc --noEmit';
    const probe = path.join(copy, 'src/__type_gate_probe.ts');
    writeFileSync(probe, 'export const applicationProbe: string = 135;');
    writeFileSync(packagePath, JSON.stringify(manifest));
    try {
      const result = runCommand();
      // This reproduces the false green; the real-command negative controls above must reject it.
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toMatch(/error TS\d+/);
    } finally { writeFileSync(packagePath, original); rmSync(probe); }
  }, 120_000);
});

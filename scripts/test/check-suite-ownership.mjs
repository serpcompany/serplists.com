import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const configurations = [
  'vitest.unit.config.ts',
  'vitest.fast-database.config.ts',
  'vitest.process.config.ts',
  'vitest.data.config.ts',
];
const list = (configuration) => execFileSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'vitest', 'list', '--config', configuration, '--filesOnly'],
  { cwd: repoRoot, encoding: 'utf8' },
).trim().split(/\r?\n/).filter(Boolean).map((file) => path.relative(repoRoot, path.resolve(repoRoot, file)));
const ownership = new Map();
for (const configuration of configurations) {
  for (const file of list(configuration)) {
    const owners = ownership.get(file) ?? [];
    owners.push(configuration);
    ownership.set(file, owners);
  }
}
const files = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(root, entry.name);
  if (entry.isDirectory()) return ['node_modules', '.git', 'tmp', 'dist', 'tests/e2e'].some((ignored) => path.relative(repoRoot, target).startsWith(ignored)) ? [] : files(target);
  return /\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [path.relative(repoRoot, target)] : [];
});
const expected = files(repoRoot).sort();
const missing = expected.filter((file) => !ownership.has(file));
const duplicate = [...ownership].filter(([, owners]) => owners.length !== 1);
if (missing.length || duplicate.length) {
  throw new Error(`Test suite ownership invalid. Missing=${missing.join(',') || 'none'} duplicate=${duplicate.map(([file, owners]) => `${file}:${owners.join('+')}`).join(',') || 'none'}`);
}
console.log(`PASS disjoint test suite ownership: ${expected.length} files across ${configurations.length} suites.`);

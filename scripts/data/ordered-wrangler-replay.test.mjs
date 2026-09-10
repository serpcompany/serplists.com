import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { applyOrderedWranglerMigrations, planOrderedWranglerReplay } from './ordered-wrangler-replay.mjs';

it('exposes tied migration names one at a time in canonical order', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ordered-wrangler-replay-'));
  const sourceDirectory = path.join(root, 'source');
  const ownedDirectory = path.join(root, 'owned');
  mkdirSync(sourceDirectory);
  mkdirSync(ownedDirectory);
  const migrations = [
    ['0001_first.sql', 'first'],
    ['0002_alpha.sql', 'alpha'],
    ['0002_beta.sql', 'beta'],
    ['0003_last.sql', 'last'],
  ];
  for (const [name, sql] of migrations) writeFileSync(path.join(sourceDirectory, name), sql);
  const observed = [];
  try {
    await applyOrderedWranglerMigrations({
      sourceDirectory,
      ownedDirectory,
      apply: () => observed.push(
        migrations.map(([name]) => name).filter((name) => {
          try { readFileSync(path.join(ownedDirectory, name)); return true; } catch { return false; }
        }),
      ),
    });
    expect(observed).toEqual([
      ['0001_first.sql', '0002_alpha.sql'],
      ['0001_first.sql', '0002_alpha.sql', '0002_beta.sql'],
      ['0001_first.sql', '0002_alpha.sql', '0002_beta.sql', '0003_last.sql'],
    ]);
    expect(migrations.map(([name, sql]) => readFileSync(path.join(ownedDirectory, name), 'utf8')))
      .toEqual(migrations.map(([, sql]) => sql));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('uses one stage when migration numbers are unambiguous', () => {
  expect(planOrderedWranglerReplay(['0001_first.sql', '0002_second.sql']))
    .toEqual([['0001_first.sql', '0002_second.sql']]);
});

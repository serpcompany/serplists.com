import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

export const CHILD_COVERAGE_VARIABLE = 'SERPLISTS_CHILD_COVERAGE';

const PROCESS_ENTRY_POINTS = [
  '.github/actions/**/*.cjs',
  '.claude/skills/**/*.ts',
  'tools/**/*.mjs',
  'scripts/*.ts',
  'scripts/checks/{cli,hook,stop-hook}.ts',
  'scripts/data/{check-drizzle-schema-parity,local-d1-data}.ts',
  'scripts/stripe/{bootstrap,configure-portal,listen-local,scrub-local-live,setup-local-test}.ts',
];

const LIBRARIES_THE_TESTS_IMPORT = ['scripts/*-lib.ts'];

export default function recordChildProcessCoverage(project: TestProject): (() => void) | undefined {
  const { coverage, root } = project.globalConfig;
  if (!coverage.enabled) return undefined;
  const reportsDirectory = `${coverage.reportsDirectory}-children`;
  const rawDirectory = `${reportsDirectory}-raw`;
  rmSync(rawDirectory, { recursive: true, force: true });
  rmSync(reportsDirectory, { recursive: true, force: true });
  mkdirSync(rawDirectory, { recursive: true });
  process.env[CHILD_COVERAGE_VARIABLE] = rawDirectory;
  return () => {
    const report = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/c8/bin/c8.js'),
        'report',
        `--temp-directory=${rawDirectory}`,
        `--reports-dir=${reportsDirectory}`,
        '--reporter=lcov',
        `--src=${root}`,
        ...PROCESS_ENTRY_POINTS.map((glob) => `--include=${glob}`),
        ...LIBRARIES_THE_TESTS_IMPORT.map((glob) => `--exclude=${glob}`),
      ],
      { stdio: 'inherit' },
    );
    rmSync(rawDirectory, { recursive: true, force: true });
    if (report.status !== 0) throw new Error(`c8 could not write the child processes' coverage to ${reportsDirectory}`);
  };
}

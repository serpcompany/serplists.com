import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const RECORD_END = 'end_of_record';

function recordsOf(lcov: string): string[] {
  return lcov
    .split(RECORD_END)
    .map((record) => record.trim())
    .filter((record) => record.length > 0);
}

function sourceOf(record: string, root: string): string {
  const line = record.split(/\r?\n/).find((each) => each.startsWith('SF:')) ?? 'SF:';
  return path.resolve(root, line.slice(3));
}

function leaveEntryPointsToTheirProcesses(inProcessReport: string, processReport: string, root: string): void {
  if (!existsSync(inProcessReport) || !existsSync(processReport)) return;
  const measuredAsProcesses = new Set(recordsOf(readFileSync(processReport, 'utf8')).map((record) => sourceOf(record, root)));
  const kept = recordsOf(readFileSync(inProcessReport, 'utf8')).filter((record) => !measuredAsProcesses.has(sourceOf(record, root)));
  writeFileSync(inProcessReport, kept.map((record) => `${record}\n${RECORD_END}\n`).join(''));
}

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
    leaveEntryPointsToTheirProcesses(path.join(coverage.reportsDirectory, 'lcov.info'), path.join(reportsDirectory, 'lcov.info'), root);
  };
}

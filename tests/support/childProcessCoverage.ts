import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestProject } from 'vitest/node';
import { z } from 'zod';

export const CHILD_COVERAGE_VARIABLE = 'SERPLISTS_CHILD_COVERAGE';

export const checkoutCopiesListOf = (rawDirectory: string): string => `${rawDirectory}-copies.txt`;

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

const require = createRequire(import.meta.url);

const C8 = require.resolve('c8/bin/c8.js');

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

const spellingsOf = (folder: string): string[] => [pathToFileURL(folder).href, JSON.stringify(folder).slice(1, -1)];

function replacedEverywhere(text: string, from: readonly string[], to: readonly string[]): string {
  return from.reduce((current, spelling, index) => current.split(spelling).join(to[index] ?? spelling), text);
}

const rawProcessCoverageSchema = z
  .object({ result: z.array(z.unknown()), 'source-map-cache': z.record(z.object({ lineLengths: z.array(z.number()) }).passthrough()).optional() })
  .passthrough();

const rawScriptCoverageSchema = z
  .object({
    url: z.string(),
    functions: z.array(z.object({ ranges: z.array(z.object({ startOffset: z.number(), endOffset: z.number() }).passthrough()) }).passthrough()),
  })
  .passthrough();

const endOfTheCodeBeforeItsSourceMapComment = (lineLengths: readonly number[]) =>
  lineLengths.slice(0, -1).reduce((offset, length) => offset + length + 1, 0);

function processCoverageIn(text: string): z.infer<typeof rawProcessCoverageSchema> | undefined {
  try {
    const parsed = rawProcessCoverageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function transformedScriptsIn(text: string): Map<string, number> {
  const cache = processCoverageIn(text)?.['source-map-cache'] ?? {};
  return new Map(Object.entries(cache).map(([url, { lineLengths }]) => [url, endOfTheCodeBeforeItsSourceMapComment(lineLengths)]));
}

function endingWithTheCode(text: string, codeEnds: ReadonlyMap<string, number>): string {
  const coverage = processCoverageIn(text);
  if (coverage === undefined) return text;
  const result = coverage.result.map((each) => {
    const script = rawScriptCoverageSchema.safeParse(each);
    const end = script.success ? codeEnds.get(script.data.url) : undefined;
    if (!script.success || end === undefined) return each;
    const clamp = <Range extends { startOffset: number; endOffset: number }>(range: Range) => ({
      ...range,
      startOffset: Math.min(range.startOffset, end),
      endOffset: Math.min(range.endOffset, end),
    });
    return { ...script.data, functions: script.data.functions.map((fn) => ({ ...fn, ranges: fn.ranges.map(clamp) })) };
  });
  return JSON.stringify({ ...coverage, result });
}

function mapCheckoutCopiesOntoTheCheckout(rawDirectory: string, root: string): void {
  const list = checkoutCopiesListOf(rawDirectory);
  if (!existsSync(list)) return;
  const copies = readFileSync(list, 'utf8').split(/\r?\n/).filter((copy) => copy.length > 0);
  rmSync(list, { force: true });
  const checkout = spellingsOf(root);
  const codeEnds = new Map<string, number>();
  for (const file of readdirSync(rawDirectory)) {
    const raw = path.join(rawDirectory, file);
    const text = readFileSync(raw, 'utf8');
    const mapped = copies.reduce((current, copy) => replacedEverywhere(current, spellingsOf(copy), checkout), text);
    if (mapped === text) continue;
    writeFileSync(raw, mapped);
    for (const [url, end] of transformedScriptsIn(mapped)) codeEnds.set(url, end);
  }
  if (codeEnds.size === 0) return;
  const urls = [...codeEnds.keys()];
  for (const file of readdirSync(rawDirectory)) {
    const raw = path.join(rawDirectory, file);
    const text = readFileSync(raw, 'utf8');
    const ended = urls.some((url) => text.includes(url)) ? endingWithTheCode(text, codeEnds) : text;
    if (ended !== text) writeFileSync(raw, ended);
  }
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
  rmSync(checkoutCopiesListOf(rawDirectory), { force: true });
  mkdirSync(rawDirectory, { recursive: true });
  process.env[CHILD_COVERAGE_VARIABLE] = rawDirectory;
  return () => {
    mapCheckoutCopiesOntoTheCheckout(rawDirectory, root);
    const report = spawnSync(
      process.execPath,
      [
        C8,
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

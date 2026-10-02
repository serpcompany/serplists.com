import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { filesGitTracksOrWouldTrack, GENERATED_FILES } from '../../../scripts/check-no-comments-lib';

const repoRoot = process.cwd();
const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'));

const JSCPD_DEFAULT_MIN_TOKENS = 50;
const JSCPD_DEFAULT_MIN_LINES = 5;
const AUTHORED_CODE_FOLDERS = ['src', 'functions', 'scripts', 'db', 'tests'];
const MIGRATIONS = '**/db/migrations/**';
const BUILD_OUTPUT = [
  '**/node_modules/**',
  '**/.next/**',
  '**/.open-next/**',
  '**/dist/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/.wrangler/**',
  '**/.turbo/**',
];
const SETTINGS = ['threshold', 'exitCode', 'minTokens', 'minLines', 'maxLines', 'maxSize', 'gitignore', 'reporters', 'ignore'];
const NO_TOKENIZER = 'Format "undefined" does not included to supported formats.';

const storedSettings = z.record(z.unknown()).parse(readJson('.jscpd.json'));
const settings = z
  .object({
    threshold: z.number().optional(),
    exitCode: z.number().default(0),
    minTokens: z.number().default(JSCPD_DEFAULT_MIN_TOKENS),
    minLines: z.number().default(JSCPD_DEFAULT_MIN_LINES),
    ignore: z.array(z.string()).default([]),
  })
  .passthrough()
  .parse(storedSettings);

const packageJson = z
  .object({ scripts: z.object({ 'check:repo': z.string() }).catchall(z.string()) })
  .passthrough()
  .parse(readJson('package.json'));
const [checkTool, ...checkedFolders] = (packageJson.scripts['duplicates:check'] ?? '').trim().split(/\s+/);

const isFolder = (folder: string) =>
  existsSync(path.join(repoRoot, folder)) && statSync(path.join(repoRoot, folder)).isDirectory();
const isUnder = (file: string) => checkedFolders.some((folder) => file.startsWith(`${folder}/`));

const filesJscpdLists = () => {
  const listing = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules/jscpd/bin/jscpd'), ...checkedFolders, '--debug'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (listing.error) throw listing.error;
  const lines = stripVTControlCharacters(listing.stdout).split(/\r?\n/);
  const skipped = new Map<string, string>();
  for (const line of lines) {
    const { file, reason } = /^File (?<file>.+) skipped! (?<reason>.+)$/.exec(line)?.groups ?? {};
    if (file && reason) skipped.set(file, reason);
  }
  return { read: new Set(lines.filter(isUnder)), skipped };
};

const isLeftOutByDesign = (file: string) => file.startsWith('db/migrations/') || GENERATED_FILES.includes(file);

const holdsNoClone = (reason: string) => {
  const lineCount = /^Code lines=(\d+) not in limits/.exec(reason)?.[1];
  return reason === NO_TOKENIZER || (lineCount !== undefined && Number(lineCount) < settings.minLines);
};

describe('pnpm run duplicates:check', { timeout: 60_000 }, () => {
  it("fails on any clone of 50 tokens and 5 lines, jscpd's defaults", () => {
    expect(settings.threshold, 'Set "threshold" in .jscpd.json back to 0: any duplicated code fails the check.').toBe(0);
    expect(
      settings.exitCode,
      'Set "exitCode" in .jscpd.json back to 1. jscpd compares the threshold with a percentage rounded to two ' +
        'decimals, so without an exit code a clone in a large folder rounds to 0% and passes.',
    ).toBeGreaterThan(0);
    expect(
      settings.minTokens,
      `Set "minTokens" in .jscpd.json back to ${JSCPD_DEFAULT_MIN_TOKENS} and move the clones it reports into a shared helper.`,
    ).toBeLessThanOrEqual(JSCPD_DEFAULT_MIN_TOKENS);
    expect(
      settings.minLines,
      `Set "minLines" in .jscpd.json back to ${JSCPD_DEFAULT_MIN_LINES} and move the clones it reports into a shared helper.`,
    ).toBeLessThanOrEqual(JSCPD_DEFAULT_MIN_LINES);
  });

  it('runs in check:repo as plain jscpd over every folder that holds authored code', () => {
    expect(packageJson.scripts['check:repo'].split('&&').map((command) => command.trim())).toContain(
      'pnpm run duplicates:check',
    );
    expect(
      { checkTool, notFolders: checkedFolders.filter((folder) => !isFolder(folder)) },
      'duplicates:check must be "jscpd" followed by the folders it checks, with no flags and no "|| true": the ' +
        'settings live in .jscpd.json, and the check fails on the first clone.',
    ).toEqual({ checkTool: 'jscpd', notFolders: [] });
    expect(
      AUTHORED_CODE_FOLDERS.filter((folder) => !checkedFolders.includes(folder)),
      'duplicates:check must name every folder that holds authored code: a clone in a folder it skips passes.',
    ).toEqual([]);
    expect(
      Object.keys(packageJson),
      'Remove the "jscpd" key from package.json: jscpd merges it under .jscpd.json, so it can add settings no test reads.',
    ).not.toContain('jscpd');
  });

  it('sets nothing in .jscpd.json that narrows what jscpd reads', () => {
    expect(
      Object.keys(storedSettings).filter((key) => !SETTINGS.includes(key)),
      `Only ${SETTINGS.join(', ')} belong in .jscpd.json. A "path" there is resolved to an absolute path, which ` +
        'jscpd globs with its backslashes on Windows and so reads no file: name the folders in duplicates:check.',
    ).toEqual([]);
  });

  it('ignores only build output, db/migrations and generated files, and keeps db/migrations out', () => {
    const allowed = [...BUILD_OUTPUT, MIGRATIONS, ...GENERATED_FILES.map((file: string) => `**/${file}`)];
    expect(
      settings.ignore.filter((pattern) => !allowed.includes(pattern)),
      'jscpd may skip only build output, db/migrations and the files a generator writes (GENERATED_FILES in ' +
        'scripts/check-no-comments-lib.ts). Move duplicated code into a shared helper instead of ignoring it.',
    ).toEqual([]);
    expect(
      settings.ignore,
      'Applied migrations are append-only history and cannot be edited to share code: keep them out of the check.',
    ).toContain(MIGRATIONS);
  });

  it('reads every file in the folders it checks but applied migrations, generated files, and those in a format jscpd has no tokenizer for or too short for a clone', () => {
    const { read, skipped } = filesJscpdLists();
    const unread = filesGitTracksOrWouldTrack()
      .filter((file: string) => isUnder(file) && existsSync(path.join(repoRoot, file)) && !read.has(file))
      .filter((file: string) => !isLeftOutByDesign(file))
      .filter((file: string) => !holdsNoClone(skipped.get(file) ?? ''))
      .map((file: string) => `${file}: ${skipped.get(file) ?? 'not listed'}`);

    expect(read.size, 'jscpd --debug listed no file to read: check that it still prints one path per line.').toBeGreaterThan(0);
    expect(
      unread,
      'jscpd skips these files, so a clone in them would pass. Raise "maxLines" or "maxSize" in .jscpd.json past ' +
        'the file, or take out the ignore that matches it.',
    ).toEqual([]);
  });
});

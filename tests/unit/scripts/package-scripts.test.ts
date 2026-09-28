import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// `db:cleanup:remote` ran db/maintenance/cleanup-seed-data.sql against production D1
// in one command. The file predated migration 0021's ON DELETE RESTRICT references to
// users (teams, team_invites, template_versions), so it failed on any test account
// that had made an Organization or a Template, and its `email LIKE '%@test.com'`
// would also have deleted real accounts on that domain. Deleting data in a remote
// database is a human-approved operation (AGENTS.md), not a package script.

const repoRoot = process.cwd();
const packageScripts = z
  .object({ scripts: z.record(z.string()) })
  .parse(JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))).scripts;

// Remote SQL files a script may run: idempotent inserts only, reviewed by a human.
const REMOTE_SQL_ALLOWLIST = ['db/seeds/official-templates.sql'];

const sqlFiles = (command: string) =>
  [...command.matchAll(/--file[= ](\S+)/g)].map(([, file]) => path.posix.normalize(file.replace(/^\.\//, '')));

const commands = Object.entries(packageScripts).flatMap(([name, script]) =>
  script.split(/&&|\|\||;/).map((command) => ({ name, command: command.trim() })),
);

describe('package.json scripts', () => {
  it('never run SQL files against a remote D1 beyond the reviewed idempotent seeds', () => {
    const remoteFiles = commands
      .filter(({ command }) => /\bd1 execute\b/.test(command) && /--remote\b/.test(command))
      .flatMap(({ name, command }) => sqlFiles(command).map((file) => `${name}: ${file}`));

    expect(remoteFiles.filter((entry) => !REMOTE_SQL_ALLOWLIST.some((file) => entry.endsWith(`: ${file}`)))).toEqual([]);
  });

  it('never run a db/maintenance script against a remote database', () => {
    expect(
      commands.filter(({ command }) => /--remote\b/.test(command) && command.includes('db/maintenance/')).map(({ name }) => name),
    ).toEqual([]);
  });

  it('only reference SQL files that exist', () => {
    const missing = commands.flatMap(({ name, command }) =>
      sqlFiles(command)
        .filter((file) => !existsSync(path.join(repoRoot, file)))
        .map((file) => `${name}: ${file}`),
    );
    expect(missing).toEqual([]);
  });
});

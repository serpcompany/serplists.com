import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listMigrationFiles, replayMigrations } from './schema-contract.ts';

// Require the actual pinned binary, not a globally installed version manager
// that could try downloading pnpm after the test isolates HOME.
const pnpm = realpathSync(process.env.PNPM_9_2_0_CLI ?? process.env.npm_execpath
  ?? execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim());
const pnpmIsShellShim = /^#!.*(?:ba|z|da|k)?sh\b/.test(readFileSync(pnpm, 'utf8').split(/\r?\n/, 1)[0]);
const pnpmCommand = pnpmIsShellShim ? pnpm : process.execPath;
const pnpmArgs = pnpmIsShellShim ? [] : [pnpm];
const stagingId = 'fcaf4325-5be7-4ead-ab60-45932a04177b';
const productionId = 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1';

beforeAll(() => {
  expect(pnpm, 'Set PNPM_9_2_0_CLI to the installed pnpm 9.2.0 bin/pnpm.cjs').toBeTruthy();
  expect(execFileSync(pnpmCommand, [...pnpmArgs, '--version'], { encoding: 'utf8' }).trim()).toBe('9.2.0');
});

function run(alias, extra = [], drift = false, environment = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'issue153-package-separator-'));
  const catalog = join(dir, 'catalog.sqlite');
  const callsFile = join(dir, 'calls.jsonl');
  const argvFile = join(dir, 'argv.json');
  const preload = join(dir, 'provider.cjs');
  const reports = join(dir, 'reports');
  const migrations = listMigrationFiles().map(m => m.name);
  const db = replayMigrations();
  try {
    db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    migrations.forEach((name, i) => db.prepare('INSERT INTO d1_migrations VALUES (?, ?)').run(i + 1, name));
    if (drift) db.exec('DELETE FROM d1_migrations WHERE id = (SELECT MAX(id) FROM d1_migrations)');
    db.exec(`VACUUM INTO '${catalog.replaceAll("'", "''")}'`);
  } finally { db.close(); }
  // Run the real package manager, shell, tsx/Node entrypoint, and comparison.
  // Replace the provider subprocess transport; no Wrangler process starts.
  writeFileSync(preload, `
const fs = require('node:fs');
const cp = require('node:child_process');
const original = cp.execFileSync;
// tsx's non-watch notification pipe is optional to these checks. The sandbox
// forbids listen(), so suppress only that launcher pipe, preserving real pnpm,
// shell, tsx argument forwarding, TypeScript loading, and application code.
if ((process.argv[1] || '').endsWith('/tsx/dist/cli.mjs')) {
  const net = require('node:net');
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function(address, callback) {
    if (typeof address !== 'string' || !/[/\\\\]tsx-\\d+[/\\\\]\\d+\\.pipe$/.test(address)) return listen.apply(this, arguments);
    queueMicrotask(callback);
    return this;
  };
}
cp.execFileSync = function(file, args, options) {
  if (/check-(?:d1-schema\\.ts|pending-migrations\\.mjs)$/.test(process.argv[1] || '')) {
    fs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
  }
  if (args?.[0] !== 'exec' || args?.[1] !== 'wrangler') return original.apply(this, arguments);
  fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + '\\n');
  if (args[2] !== 'd1') throw new Error('Unexpected provider operation');
  if (args[3] === 'info') return JSON.stringify({name:'serp-checklists-staging-db',uuid:${JSON.stringify(stagingId)}});
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(${JSON.stringify(catalog)}, {readOnly:true});
  try {
    if (args[3] === 'migrations' && args[4] === 'list') {
      const applied = new Set(db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row=>row.name));
      const missing = ${JSON.stringify(migrations)}.filter(name=>!applied.has(name));
      return missing.length ? 'Migrations to be applied:\\n┌────────────────────────────────────┐\\n' + missing.map(name=>'│ '+name+' │').join('\\n') + '\\n└────────────────────────────────────┘' : 'No migrations to apply!';
    }
    if (args[3] !== 'execute') throw new Error('Unexpected provider operation');
    const sql = args.find(arg=>arg.startsWith('--command='))?.slice(10) ?? args[args.indexOf('--command') + 1];
    return JSON.stringify(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>({success:true,meta:{duration:0},results:db.prepare(s).all()})));
  } finally { db.close(); }
};
require('node:module').syncBuiltinESMExports();
`);
  try {
    const result = spawnSync(pnpmCommand, [...pnpmArgs, 'run', alias, '--', '--report-dir', reports, ...extra], {
      encoding: 'utf8', timeout: 5000,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: dir, CI: '1', NODE_OPTIONS: `--require=${preload}`, ...environment },
    });
    const name = alias === 'check:staging:d1-schema' ? 'd1-schema-staging' : 'pending-migrations-staging';
    const reportPath = join(reports, `${name}.json`);
    return {
      ...result,
      argv: existsSync(argvFile) ? JSON.parse(readFileSync(argvFile, 'utf8')) : null,
      calls: existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n').map(JSON.parse) : [],
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe.each(['check:staging:d1-schema', 'db:migrations:check:staging'])('pnpm 9.2.0 package separator: %s', alias => {
  it('forwards one literal separator and reaches the healthy comparison', () => {
    const result = run(alias);
    expect(result.argv, result.stdout + result.stderr).toContain('--');
    expect(result.argv.filter(arg=>arg === '--')).toHaveLength(1);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.report).toMatchObject({verdict:'pass',target:{environment:'staging',binding:'DB',databaseId:stagingId}});
    expect(result.calls.some(args=>args.includes(alias === 'check:staging:d1-schema' ? 'execute' : 'list'))).toBe(true);
    if (alias === 'check:staging:d1-schema') {
      expect(result.report.ledger.verdict).toBe('pass');
      expect(result.report.schemaDifferences.migrationObjects.verdict).toBe('pass');
    } else expect(result.report.pendingMigrations).toEqual([]);
  });
  it('still detects ledger drift at the real comparison stage', () => {
    const result = run(alias, [], true);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.calls.some(args=>args.includes(alias === 'check:staging:d1-schema' ? 'execute' : 'list'))).toBe(true);
    if (alias === 'check:staging:d1-schema') expect(result.report.ledger.verdict).toBe('fail');
    else expect(result.report.pendingMigrations).toEqual(['0024_safe_template_evolution.sql']);
  });
  it.each([
    ['--database-id', productionId], ['--database', 'serp-checklists-db'], ['--local'],
    ['--label', 'staging'], ['--unknown'], ['--binding'], ['--binding='],
    ['--binding', '--', 'DB'], ['--'], ['--', '--unknown'],
  ].map(args=>[args]))('rejects invalid or ambiguous suffix %j without provider calls', args => {
    const result = run(alias, args);
    expect(result.argv, result.stdout + result.stderr).toContain('--');
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.report?.verdict).toBe('fail');
  });
});

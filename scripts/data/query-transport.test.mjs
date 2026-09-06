import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runDataCommand } from './data-command-lib.mjs';
import { listMigrationFiles } from './schema-contract.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const importSummary = JSON.stringify([{ success: true, finalBookmark: 'fixture-bookmark',
  meta: { duration: 0, rows_read: 0, rows_written: 0, size_after: 0 },
  results: [{ 'Total queries executed': 1, 'Rows read': 0, 'Rows written': 0, 'Database size (MB)': '0.00' }] }]);
const envelope = results => JSON.stringify([{ success: true, meta: {}, results }]);

function transport() {
  const db = new DatabaseSync(':memory:');
  for (const { name } of listMigrationFiles()) db.exec(readFileSync(path.join(repoRoot, 'db/migrations', name), 'utf8'));
  const events = [];
  const run = (operation, corrupt = {}) => runDataCommand({
    argv: [operation, '--environment', 'rehearsal', '--database-name', 'serp-checklists-rehearsal-152',
      '--database-id', '12345678-1234-4234-8234-123456789abc', '--confirm-database-id', '12345678-1234-4234-8234-123456789abc', '--execute'],
    repoRoot, gitCommit: 'a'.repeat(40), write: () => {},
    runCommand: command => {
      const kind = command.includes('info') ? 'identity' : command.includes('--file') ? 'import' : 'query';
      events.push(kind);
      if (corrupt[kind]) return typeof corrupt[kind] === 'function' ? corrupt[kind](command, events.length) : corrupt[kind];
      if (kind === 'identity') return JSON.stringify({ name: 'serp-checklists-rehearsal-152', uuid: '12345678-1234-4234-8234-123456789abc' });
      if (kind === 'import') { db.exec(readFileSync(command[command.indexOf('--file') + 1], 'utf8')); return importSummary; }
      const sql = command.find(arg => arg.startsWith('--command='))?.slice('--command='.length)
        ?? command[command.indexOf('--command') + 1];
      if (sql.includes('SELECT id, name FROM d1_migrations')) return envelope(listMigrationFiles().map(({ name }, i) => ({ id: i + 1, name })));
      return JSON.stringify(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => ({ success: true, meta: {}, results: db.prepare(s).all() })));
    },
  });
  return { db, events, run };
}

describe('Wrangler query versus import transport', () => {
  it.each(['fixture-setup', 'fixture-teardown'])('rejects failed %s imports before query verification', operation => {
    const t = transport();
    try {
      expect(() => t.run(operation, { import: JSON.stringify([{ success: false, meta: {}, results: [], error: 'private failure' }]) })).toThrow(/Fixture import/);
      expect(t.events).toEqual(['identity', 'import', 'identity']);
    } finally { t.db.close(); }
  });

  it.each([importSummary, JSON.stringify([{ success: false, meta: {}, results: [], error: 'private failure' }]), envelope([])])
  ('rejects summaries, failures and missing rows from fixture query verification: %s', query => {
    const t = transport();
    try {
      expect(() => t.run('fixture-setup', { query })).toThrow(/fixture/i);
      expect(t.events).toEqual(['identity', 'import', 'identity', 'identity', 'query', 'identity']);
    } finally { t.db.close(); }
  });

  it.each([1, 2, 3, 4, 5, 6])('stops fixture execution on transport failure at operation %i', failAt => {
    const t = transport();
    try {
      const identity = (_command, n) => {
        if (n === failAt) throw new Error('private transport failure');
        return JSON.stringify({ name: 'serp-checklists-rehearsal-152', uuid: '12345678-1234-4234-8234-123456789abc' });
      };
      expect(() => t.run('fixture-setup', {
        identity,
        import: () => { if (failAt === 2) throw new Error('private import failure'); return importSummary; },
        query: () => { if (failAt === 5) throw new Error('private query failure'); return envelope([]); },
      })).toThrow(/data command/i);
      expect(t.events).toHaveLength(failAt);
    } finally { t.db.close(); }
  });

  it.each([importSummary, JSON.stringify([{ success: false, meta: {}, results: [], error: 'private failure' }])])
  ('rejects invalid public count query evidence after the ledger: %s', output => {
    const t = transport();
    try {
      expect(() => t.run('invariant-capture', { query: command => command.some(s => s.includes('SELECT id, name FROM d1_migrations'))
        ? envelope(listMigrationFiles().map(({ name }, i) => ({ id: i + 1, name }))) : output })).toThrow(/invariant/i);
      expect(t.events).toEqual(['identity', 'query', 'identity', 'identity', 'query', 'identity']);
    } finally { t.db.close(); }
  });

  it('imports fixture setup and teardown then separately verifies exact counts with identity checks', () => {
    const t = transport();
    try {
      t.db.exec("INSERT INTO users(id,email,created_at) VALUES ('unrelated-owner','unrelated@example.invalid','2026-01-01')");
      expect(JSON.parse(t.run('fixture-setup').output).fixtureCounts).toEqual({ users: 1, templates: 1, checklistRuns: 1 });
      expect(t.db.prepare("SELECT user_id, template_id FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1'").get())
        .toMatchObject({ user_id: 'data-safety-fixture-user-v1', template_id: 'data-safety-fixture-template-v1' });
      expect(t.events).toEqual(['identity', 'import', 'identity', 'identity', 'query', 'identity']);
      t.events.length = 0;
      expect(JSON.parse(t.run('fixture-teardown').output).fixtureCounts).toEqual({ users: 0, templates: 0, checklistRuns: 0 });
      expect(t.events).toEqual(['identity', 'import', 'identity', 'identity', 'query', 'identity']);
      expect(t.db.prepare('SELECT id FROM users').all()).toEqual([{ id: 'unrelated-owner' }]);
    } finally { t.db.close(); }
  });
  it('reads public versioned invariant counts without invoking import', () => {
    const t = transport();
    try {
      expect(t.run('invariant-capture').invariantContext.sqlVersions).toEqual(['0001_initial_schema.sql', '0024_safe_template_evolution.sql']);
      expect(t.events).toEqual(['identity', 'query', 'identity', 'identity', 'query', 'identity', 'identity', 'query', 'identity']);
    } finally { t.db.close(); }
  });
});

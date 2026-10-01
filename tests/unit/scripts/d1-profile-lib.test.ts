import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  assignMissingStableTemplateIdentities,
  validateStableTemplateIdentities,
} from '../../../functions/api/utils/template-reconciliation';
import {
  buildUpdateTemplateBody,
  computeDatasetKey,
  d1QueryRecordIn,
  evaluateScenarioResults,
  formatStatus,
  readSnapshotMeta,
  resolveDatasetPlan,
  restoreSnapshot,
  saveSnapshot,
  scenarios,
} from '../../../scripts/d1-profile-lib';

const syntheticSections = [
  { id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task one' }, { id: 'i2', title: 'Task two' }] },
];

function applyAsThePutHandlerDoes(stored: unknown[], nonce: string) {
  const body = buildUpdateTemplateBody({ sections: stored, version: 1 }, nonce);
  const next = assignMissingStableTemplateIdentities(body.sections, stored);
  return { next, error: validateStableTemplateIdentities(next) };
}

describe('buildUpdateTemplateBody', () => {
  it('builds a valid update on every reuse, with a stable section count', () => {
    const first = applyAsThePutHandlerDoes(syntheticSections, 'a1');
    expect(first.error).toBeNull();

    const second = applyAsThePutHandlerDoes(first.next, 'b2');
    expect(second.error).toBeNull();
    expect(second.next).toHaveLength(first.next.length);

    const third = applyAsThePutHandlerDoes(second.next, 'c3');
    expect(third.error).toBeNull();
    expect(third.next.map((section) => section.id)).toEqual(['s1', 's-profiled-c3']);
  });

  it('replaces a section a previous profile run left behind', () => {
    const leftover = [...syntheticSections, { id: 's-profiled', title: 'Added', items: [{ id: 'i-profiled', title: 'New task' }] }];
    const body = buildUpdateTemplateBody({ sections: leftover, version: 4 }, 'n1');

    expect(body.sections.map((section) => (section as { id: string }).id)).toEqual(['s1', 's-profiled-n1']);
    expect(body.expected_version).toBe(4);
    expect(validateStableTemplateIdentities(assignMissingStableTemplateIdentities(body.sections, leftover))).toBeNull();
  });

  it('handles a template with no sections', () => {
    const body = buildUpdateTemplateBody({ version: 1 }, 'x');
    expect(validateStableTemplateIdentities(body.sections)).toBeNull();
    expect(body.sections).toHaveLength(1);
  });
});

describe('scenario status check', () => {
  it('expects 200 from every scenario but the unpublished sitemap pages, profiled for the cost of their 404 guard', () => {
    for (const scenario of scenarios()) {
      const expected = scenario.name.includes('(unpublished page)') ? 404 : 200;
      expect(scenario.expectedStatus, scenario.name).toBe(expected);
    }
  });

  it('fails the profile when a scenario measures an error path, rather than report a cost drop', () => {
    const update = { name: 'update template (reconciles runs)', expectedStatus: 200 };
    const freeRun = { name: 'start run (Free plan, counts active runs)', expectedStatus: 200 };
    const catalog = { name: 'public catalog', expectedStatus: 200 };

    const result = evaluateScenarioResults([
      { scenario: catalog, status: 200 },
      { scenario: update, status: 400, responseBody: '{"error":"Duplicate section id: s-profiled"}' },
      { scenario: freeRun, status: 403 },
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.failures).toEqual([
      { name: update.name, expected: 200, actual: 400, responseBody: '{"error":"Duplicate section id: s-profiled"}' },
      { name: freeRun.name, expected: 200, actual: 403, responseBody: '' },
    ]);
    expect(formatStatus({ scenario: update, status: 400 })).toBe('INVALID (expected 200, got 400)');
    expect(formatStatus({ scenario: catalog, status: 200 })).toBe('200');
    expect(evaluateScenarioResults([{ scenario: catalog, status: 200 }])).toEqual({ failures: [], exitCode: 0 });
  });
});

describe('d1QueryRecordIn', () => {
  const record = { sql: 'select 1', rowsRead: 3, rowsWritten: 0, rowsReturned: 1, durationMs: 2 };

  it('reads a d1_query record from a server output line, whatever the line starts with', () => {
    const line = `[wrangler:info] ${JSON.stringify({ level: 'info', message: 'd1_query', requestId: 'r1', ...record })}`;
    expect(d1QueryRecordIn(line)).toEqual({ level: 'info', message: 'd1_query', requestId: 'r1', ...record });
  });

  it('skips other log lines, lines that are not JSON and records without their row counts', () => {
    expect(d1QueryRecordIn(JSON.stringify({ level: 'info', message: 'api_request', status: 200 }))).toBeNull();
    expect(d1QueryRecordIn('GET /api/health 200 OK')).toBeNull();
    expect(d1QueryRecordIn('{"level":"info","message":"d1_query"')).toBeNull();
    expect(d1QueryRecordIn(JSON.stringify({ level: 'info', message: 'd1_query', sql: 'select 1' }))).toBeNull();
  });
});

describe('resolveDatasetPlan', () => {
  const datasetKey = computeDatasetKey(['migrations', 'seed', 'synthetic']);

  it('restores the pristine snapshot on --reuse instead of replaying on mutated data', () => {
    expect(resolveDatasetPlan({ reuse: true, snapshot: { scale: 1, datasetKey }, scale: 1, datasetKey }).action).toBe('restore');
  });

  it('rebuilds without --reuse, without a snapshot, or when the snapshot does not match', () => {
    expect(resolveDatasetPlan({ reuse: false, snapshot: { scale: 1, datasetKey }, scale: 1, datasetKey }).action).toBe('rebuild');
    expect(resolveDatasetPlan({ reuse: true, snapshot: null, scale: 1, datasetKey }).action).toBe('rebuild');
    expect(resolveDatasetPlan({ reuse: true, snapshot: { scale: 1, datasetKey }, scale: 3, datasetKey })).toEqual({
      action: 'rebuild',
      reason: 'the snapshot is scale 1, not 3, so rebuilding',
    });
    const changed = computeDatasetKey(['migrations plus one', 'seed', 'synthetic']);
    expect(resolveDatasetPlan({ reuse: true, snapshot: { scale: 1, datasetKey }, scale: 1, datasetKey: changed }).action).toBe('rebuild');
  });
});

describe('pristine snapshot', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'serplists-d1-profile-'));
  const statePath = path.join(root, 'd1-profile-state');
  const snapshotPath = path.join(root, 'd1-profile-pristine');
  const database = path.join('v3', 'd1', 'miniflare-D1DatabaseObject', 'db.sqlite');
  const meta = { scale: 1, datasetKey: 'key' };

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('restores the data as built, dropping the previous run writes', () => {
    mkdirSync(path.dirname(path.join(statePath, database)), { recursive: true });
    writeFileSync(path.join(statePath, database), 'built');
    writeFileSync(path.join(statePath, `${database}-wal`), 'wal');
    saveSnapshot({ statePath, snapshotPath, meta });
    expect(readSnapshotMeta(snapshotPath)).toEqual(meta);

    writeFileSync(path.join(statePath, database), 'mutated by the workload');
    writeFileSync(path.join(statePath, 'extra-file'), 'left by the workload');
    restoreSnapshot({ snapshotPath, statePath });

    expect(readFileSync(path.join(statePath, database), 'utf8')).toBe('built');
    expect(readFileSync(path.join(statePath, `${database}-wal`), 'utf8')).toBe('wal');
    expect(existsSync(path.join(statePath, 'extra-file'))).toBe(false);
  });

  it('never reuses a snapshot whose copy did not finish or whose meta is unreadable', () => {
    rmSync(path.join(snapshotPath, 'meta.json'));
    expect(readSnapshotMeta(snapshotPath)).toBeNull();

    writeFileSync(path.join(snapshotPath, 'meta.json'), '{"scale":"one"}');
    expect(readSnapshotMeta(snapshotPath)).toBeNull();

    expect(readSnapshotMeta(path.join(root, 'missing'))).toBeNull();
  });
});

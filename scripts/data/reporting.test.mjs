import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDataCheckReports } from './reporting.mjs';

describe('consistent data report outcomes', () => {
  it.each([
    ['overall failure with passing checks', { verdict: 'fail', checks: [{ name: 'mutation', verdict: 'pass' }] }, 'fail'],
    ['empty failed checks', { verdict: 'fail', checks: [] }, 'fail'],
    ['mixed checks', { verdict: 'fail', checks: [{ name: 'good', verdict: 'pass' }, { name: 'bad', verdict: 'fail' }] }, 'fail'],
    ['malformed verdict', { verdict: 'unknown', checks: [{ name: 'good', verdict: 'pass' }] }, 'fail'],
    ['missing verdict', { checks: [{ name: 'good', verdict: 'pass' }] }, 'fail'],
    ['passing claim with failed check', { verdict: 'pass', checks: [{ name: 'bad', verdict: 'fail' }] }, 'fail'],
    ['standalone evidence failure', { verdict: 'pass', checks: [], evidenceChecks: [{ name: 'health', verdict: 'fail' }] }, 'fail'],
    ['malformed check', { verdict: 'pass', checks: [null] }, 'fail'],
    ['passing named checks', { verdict: 'pass', checks: [{ name: 'good', verdict: 'pass' }] }, 'pass'],
    ['passing empty checks', { verdict: 'pass', checks: [] }, 'pass'],
  ])('%s agrees across JSON, JUnit and readable artifacts', (_name, report, verdict) => {
    const directory = mkdtempSync(join(tmpdir(), 'data-report-verdict-'));
    try {
      const paths = writeDataCheckReports({ name: 'example', report, summary: 'PASS example', reportDirectory: directory });
      expect(JSON.parse(readFileSync(paths.json, 'utf8')).verdict).toBe(verdict);
      expect(readFileSync(paths.junit, 'utf8')).toMatch(verdict === 'pass' ? /failures="0"/ : /failures="[1-9][0-9]*"/);
      for (const file of [paths.markdown, paths.text]) {
        const text = readFileSync(file, 'utf8');
        expect(text).toContain(`Verdict: ${verdict.toUpperCase()}`);
        if (verdict === 'fail') expect(text).not.toContain('PASS example');
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

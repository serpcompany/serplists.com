import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const ordinaryCoverageHarnesses = [
  'scripts/data/run-template-limit-coverage.mjs',
  'scripts/data/run-team-query-coverage.mjs',
];

it('keeps ordinary coverage fixtures and assertions on Drizzle with exact infrastructure exceptions', () => {
  for (const file of ordinaryCoverageHarnesses) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\bdb\.prepare\s*\(/);
  }
  const infrastructure = readFileSync('scripts/data/run-admin-billing-sitemap-coverage.mjs', 'utf8');
  const rawCalls = [...infrastructure.matchAll(/db\.prepare\(([^\n]+)/g)].map((match) => match[1]);
  expect(rawCalls).toHaveLength(3);
  expect(rawCalls[0]).toContain('d1_migrations ORDER BY id');
  expect(rawCalls[1]).toContain('CREATE TRIGGER coverage_subscription_failure');
  expect(rawCalls[2]).toContain('DROP TRIGGER coverage_subscription_failure');
});

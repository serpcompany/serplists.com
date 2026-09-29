import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LOCAL_SEED_STEPS,
  parseSeedStatus,
  planSeedSteps,
  RESET_SEED_STEPS,
  SEED_STATUS_PREFIX,
} from '../../../scripts/lib/local-d1-seed.mjs';
import { renderDevVars, runLocalD1Setup } from '../../../scripts/setup-local-lib.mjs';

const example = readFileSync(path.join(process.cwd(), '.dev.vars.example'), 'utf8');
const SECRET = 'a'.repeat(48);

describe('renderDevVars', () => {
  it('fills in the auth secret and comments out placeholder integrations', () => {
    const lines = renderDevVars(example, SECRET).split('\n');

    expect(lines).toContain(`BETTER_AUTH_SECRET=${SECRET}`);
    expect(lines).toContain('# RESEND_API_KEY=re_xxx');
    expect(lines).toContain('# STRIPE_SECRET_KEY=sk_test_xxx');
    expect(lines).toContain('FRONTEND_URL=http://localhost:3000');
  });

  it('gives a CRLF checkout of .dev.vars.example the same result', () => {
    const crlf = example.replace(/\r?\n/g, '\r\n');

    expect(renderDevVars(crlf, SECRET)).toBe(renderDevVars(example, SECRET));
    expect(renderDevVars(crlf, SECRET).split('\n')).toContain(`BETTER_AUTH_SECRET=${SECRET}`);
  });
});

// `pnpm run setup` used to seed only when .wrangler/state/v3/d1/miniflare-D1DatabaseObject
// was missing. d1-reset-local creates that directory by migrating before it seeds, so
// after a failed or interrupted seed (or once dev:api had created the database) every
// later setup only migrated and still printed the john@test.com sign-in.
describe('runLocalD1Setup', () => {
  const seeded = { testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false };
  const empty = { testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false };

  // A fake local D1: seed steps flip the status the way the real ones do.
  function fakeDatabase(initial: typeof seeded, { failOn }: { failOn?: string } = {}) {
    const status = { ...initial };
    const steps: string[] = [];
    const run = (step: string) => {
      steps.push(step);
      if (step === failOn) throw new Error(`${step} failed`);
      if (step === 'reset') Object.assign(status, seeded);
      if (step === 'seed-test') Object.assign(status, { testData: true, legacyTestSlugs: false });
      if (step === 'repair-test-slugs') status.legacyTestSlugs = false;
      if (step === 'official-templates') {
        // The official slugs are still held by the test Templates.
        if (status.legacyTestSlugs) throw new Error('UNIQUE constraint failed: templates.slug');
        status.officialTemplates = true;
      }
      if (step === 'official-login') status.officialLogin = status.officialTemplates;
    };
    return { steps, run, readSeedStatus: () => ({ ...status }) };
  }

  it('creates and seeds local D1 when there is none', () => {
    const db = fakeDatabase(empty);
    expect(runLocalD1Setup({ stateDirExists: false, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['reset']);
  });

  it('only migrates a database that is already seeded', () => {
    const db = fakeDatabase(seeded);
    runLocalD1Setup({ stateDirExists: true, ...db });
    expect(db.steps).toEqual(['migrate']);
  });

  it('seeds a database whose directory exists but whose seed never ran or failed', () => {
    const db = fakeDatabase(empty);
    expect(runLocalD1Setup({ stateDirExists: true, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['migrate', 'seed-test', 'official-templates', 'official-login']);
  });

  it('runs only the stages that are missing, never resetting existing test data', () => {
    const noOfficial = fakeDatabase({ ...seeded, officialTemplates: false, officialLogin: false });
    runLocalD1Setup({ stateDirExists: true, ...noOfficial });
    expect(noOfficial.steps).toEqual(['migrate', 'official-templates', 'official-login']);

    const noLogin = fakeDatabase({ ...seeded, officialLogin: false });
    runLocalD1Setup({ stateDirExists: true, ...noLogin });
    expect(noLogin.steps).toEqual(['migrate', 'official-login']);

    const noTestData = fakeDatabase({ ...seeded, testData: false });
    runLocalD1Setup({ stateDirExists: true, ...noTestData });
    expect(noTestData.steps).toEqual(['migrate', 'seed-test']);
  });

  it('fails, so no sign-in hint is printed, when a seed step fails or data is still missing', () => {
    const failing = fakeDatabase(empty, { failOn: 'seed-test' });
    expect(() => runLocalD1Setup({ stateDirExists: true, ...failing })).toThrow('seed-test failed');

    const stillEmpty = { steps: [] as string[], run: () => undefined, readSeedStatus: () => empty };
    expect(() => runLocalD1Setup({ stateDirExists: false, ...stillEmpty })).toThrow(
      /still missing test data .*official Templates, the official SERP login.*db:reset/,
    );
  });

  // A database seeded before the test Templates got sample- slugs: those Templates hold four
  // official slugs, so the official Templates were skipped and their seed now fails.
  it('renames the old test slugs before seeding the official Templates, without reseeding test data', () => {
    const db = fakeDatabase({ ...seeded, officialTemplates: false, legacyTestSlugs: true });

    expect(runLocalD1Setup({ stateDirExists: true, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['migrate', 'repair-test-slugs', 'official-templates', 'official-login']);

    runLocalD1Setup({ stateDirExists: true, ...db });
    expect(db.steps.slice(4)).toEqual(['migrate']);
  });

  it('names the seed stage that failed and how to recover', () => {
    const db = fakeDatabase({ ...seeded, officialTemplates: false, officialLogin: false }, { failOn: 'official-templates' });

    expect(() => runLocalD1Setup({ stateDirExists: true, ...db })).toThrow(
      /^Seed stage official-templates failed: .*pnpm run db:seed.*pnpm run db:reset/s,
    );
    expect(db.steps).toEqual(['migrate', 'official-templates']);
  });
});

describe('local D1 seed status', () => {
  it('reads the status line from the seed-status output', () => {
    const output = ['wrangler: using local persistence', `${SEED_STATUS_PREFIX}{"testData":true,"officialTemplates":false,"officialLogin":false,"legacyTestSlugs":true}`, ''].join('\r\n');
    expect(parseSeedStatus(output)).toEqual({ testData: true, officialTemplates: false, officialLogin: false, legacyTestSlugs: true });
    expect(parseSeedStatus(`${SEED_STATUS_PREFIX}{"testData":true,"officialTemplates":true,"officialLogin":true}`)).toEqual({
      testData: true,
      officialTemplates: true,
      officialLogin: true,
      legacyTestSlugs: false,
    });
    expect(() => parseSeedStatus('no status here')).toThrow('printed no status line');
    expect(() => parseSeedStatus(`${SEED_STATUS_PREFIX}{"testData":"yes"}`)).toThrow();
  });

  it('keeps the seed stages in the order db:reset runs them', () => {
    expect(LOCAL_SEED_STEPS.map((step) => step.id)).toEqual(['seed-test', 'repair-test-slugs', 'official-templates', 'official-login']);
    // A fresh seed-test writes today's slugs, so db:reset skips the repair.
    expect(RESET_SEED_STEPS.map((step) => step.id)).toEqual(['seed-test', 'official-templates', 'official-login']);
    expect(planSeedSteps({ testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: true })).toEqual(
      RESET_SEED_STEPS.map((step) => step.id),
    );
    expect(planSeedSteps({ testData: true, officialTemplates: false, officialLogin: true, legacyTestSlugs: true })).toEqual(
      ['repair-test-slugs', 'official-templates', 'official-login'],
    );
  });
});

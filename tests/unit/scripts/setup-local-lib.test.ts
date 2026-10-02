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
  it('fills in the auth secret and comments out placeholder integrations, so they stay off until someone sets real test values', () => {
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

describe('runLocalD1Setup', () => {
  const seeded = { testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false };
  const empty = { testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false };

  function fakeLocalD1(initial: typeof seeded, { failOn }: { failOn?: string } = {}) {
    const status = { ...initial };
    const steps: string[] = [];
    const run = (step: string) => {
      steps.push(step);
      if (step === failOn) throw new Error(`${step} failed`);
      if (step === 'reset') Object.assign(status, seeded);
      if (step === 'seed-test') Object.assign(status, { testData: true, legacyTestSlugs: false });
      if (step === 'repair-test-slugs') status.legacyTestSlugs = false;
      if (step === 'official-templates') {
        const testTemplatesHoldTheOfficialSlugs = status.legacyTestSlugs;
        if (testTemplatesHoldTheOfficialSlugs) throw new Error('UNIQUE constraint failed: templates.slug');
        status.officialTemplates = true;
      }
      if (step === 'official-login') status.officialLogin = status.officialTemplates;
    };
    return { steps, run, readSeedStatus: () => ({ ...status }) };
  }

  it('creates and seeds local D1 when there is none', () => {
    const db = fakeLocalD1(empty);
    expect(runLocalD1Setup({ stateDirExists: false, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['reset']);
  });

  it('only migrates a database that is already seeded', () => {
    const db = fakeLocalD1(seeded);
    runLocalD1Setup({ stateDirExists: true, ...db });
    expect(db.steps).toEqual(['migrate']);
  });

  it('seeds a database whose directory exists but whose seed never ran or failed', () => {
    const db = fakeLocalD1(empty);
    expect(runLocalD1Setup({ stateDirExists: true, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['migrate', 'seed-test', 'official-templates', 'official-login']);
  });

  it('runs only the stages that are missing, never resetting existing test data', () => {
    const noOfficial = fakeLocalD1({ ...seeded, officialTemplates: false, officialLogin: false });
    runLocalD1Setup({ stateDirExists: true, ...noOfficial });
    expect(noOfficial.steps).toEqual(['migrate', 'official-templates', 'official-login']);

    const noLogin = fakeLocalD1({ ...seeded, officialLogin: false });
    runLocalD1Setup({ stateDirExists: true, ...noLogin });
    expect(noLogin.steps).toEqual(['migrate', 'official-login']);

    const noTestData = fakeLocalD1({ ...seeded, testData: false });
    runLocalD1Setup({ stateDirExists: true, ...noTestData });
    expect(noTestData.steps).toEqual(['migrate', 'seed-test']);
  });

  it('fails, so no sign-in hint is printed, when a seed step fails or data is still missing', () => {
    const failing = fakeLocalD1(empty, { failOn: 'seed-test' });
    expect(() => runLocalD1Setup({ stateDirExists: true, ...failing })).toThrow('seed-test failed');

    const stillEmpty = { steps: [] as string[], run: () => undefined, readSeedStatus: () => empty };
    expect(() => runLocalD1Setup({ stateDirExists: false, ...stillEmpty })).toThrow(
      /still missing test data .*official Templates, the official SERP login.*db:reset/,
    );
  });

  it('renames the test Templates holding official slugs from an older seed before seeding the official Templates, without reseeding test data', () => {
    const db = fakeLocalD1({ ...seeded, officialTemplates: false, legacyTestSlugs: true });

    expect(runLocalD1Setup({ stateDirExists: true, ...db })).toEqual(seeded);
    expect(db.steps).toEqual(['migrate', 'repair-test-slugs', 'official-templates', 'official-login']);

    runLocalD1Setup({ stateDirExists: true, ...db });
    expect(db.steps.slice(4)).toEqual(['migrate']);
  });

  it('names the seed stage that failed and how to recover', () => {
    const db = fakeLocalD1({ ...seeded, officialTemplates: false, officialLogin: false }, { failOn: 'official-templates' });

    expect(() => runLocalD1Setup({ stateDirExists: true, ...db })).toThrow(
      /^Seed stage official-templates failed: .*pnpm run db:seed.*pnpm run db:reset/s,
    );
    expect(db.steps).toEqual(['migrate', 'official-templates']);
  });
});

describe('local D1 seed status', () => {
  it('reads the status line from the seed-status output, among the lines Wrangler logs around it', () => {
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

  it('keeps the seed stages in the order they run', () => {
    expect(LOCAL_SEED_STEPS.map((step) => step.id)).toEqual(['seed-test', 'repair-test-slugs', 'official-templates', 'official-login']);
  });

  it('leaves the slug repair out of db:reset and a fresh seed, since seed-test writes today\'s slugs', () => {
    expect(RESET_SEED_STEPS.map((step) => step.id)).toEqual(['seed-test', 'official-templates', 'official-login']);
    expect(planSeedSteps({ testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: true })).toEqual(
      RESET_SEED_STEPS.map((step) => step.id),
    );
  });

  it('seeds the official login again after the official Templates, since it needs their SERP User', () => {
    expect(planSeedSteps({ testData: true, officialTemplates: false, officialLogin: true, legacyTestSlugs: true })).toEqual(
      ['repair-test-slugs', 'official-templates', 'official-login'],
    );
  });
});

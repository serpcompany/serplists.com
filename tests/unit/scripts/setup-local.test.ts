import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { arrayContaining } from '../../support/asymmetricMatchers';
import type { CheckoutCopy } from '../../support/checkoutCopy';
import { aCopyOfTheCheckoutWithStandIns } from '../../support/checkoutCopyWithStandIns';
import { capturedGroup } from '../../support/elements';
import { queryTheCopysLocalD1, runTheCopysScript, seedStatusOf } from '../../support/scriptInACheckoutCopy';

const SETUP = 'scripts/setup-local.ts';

const A_PLAYWRIGHT_THAT_ONLY_SAYS_WHAT_IT_WAS_ASKED = {
  '@playwright/test': {
    'package.json': JSON.stringify({ name: '@playwright/test', version: '0.0.0-stand-in', bin: { playwright: 'cli.js' } }),
    'cli.js': "console.log(`playwright stand-in asked to ${process.argv.slice(2).join(' ')}`);\n",
  },
};

const EVERYTHING_SEEDED = { testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false };

describe('pnpm run setup, in a copy of the checkout whose Playwright is a stand-in', { timeout: 300_000 }, () => {
  let copy: CheckoutCopy;
  const devVarsOf = () => readFileSync(path.join(copy.root, '.dev.vars'), 'utf8');

  beforeAll(async () => {
    copy = await aCopyOfTheCheckoutWithStandIns(A_PLAYWRIGHT_THAT_ONLY_SAYS_WHAT_IT_WAS_ASKED);
  }, 120_000);
  afterAll(() => copy.remove(), 120_000);

  it('sets up a fresh checkout: writes .dev.vars with a new secret, builds and seeds local D1, and asks Playwright for Chromium', async () => {
    const run = await runTheCopysScript(copy, SETUP);
    const devVars = devVarsOf();
    const secret = capturedGroup(devVars.match(/^BETTER_AUTH_SECRET=([0-9a-f]{48})$/m), 1);

    expect(run.status).toBe(0);
    expect(devVars.split('\n')).toEqual(
      arrayContaining([
        `BETTER_AUTH_SECRET=${secret}`,
        '# JWT_SECRET=replace-with-32-char-secret',
        'FRONTEND_URL=http://localhost:3000',
        '# RESEND_API_KEY=re_xxx',
        '# STRIPE_SECRET_KEY=sk_test_xxx',
        '# ENTITLEMENTS_ADMIN_SECRET=replace-with-admin-secret',
      ]),
    );
    expect(run.stdout).toContain('Created .dev.vars with a generated BETTER_AUTH_SECRET. Optional integrations are commented out.');
    expect(run.stdout).toContain('> Validate environment');
    expect(run.stdout).toContain('env ok');
    expect(run.stdout).toContain('> Create and seed local D1');
    expect(run.stdout).toContain('Local D1 reset complete');
    expect(run.stdout).toContain('> Install the Playwright browser (no-op when present)');
    expect(run.stdout).toContain('playwright stand-in asked to install chromium');
    expect(run.stdout).toContain('Setup complete.');
    expect(await seedStatusOf(copy)).toEqual(EVERYTHING_SEEDED);
  });

  it('leaves an existing .dev.vars alone, migrates the existing local D1 and seeds only what it is missing', async () => {
    const devVarsBefore = devVarsOf();
    await queryTheCopysLocalD1(copy, "DELETE FROM account WHERE id = 'account-serp-user-credential'");

    const run = await runTheCopysScript(copy, SETUP);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('.dev.vars exists; leaving it unchanged.');
    expect(devVarsOf()).toBe(devVarsBefore);
    expect(run.stdout).toContain('> Apply pending local D1 migrations');
    expect(run.stdout).toContain('> Seed the official SERP login');
    expect(run.stdout).not.toContain('> Create and seed local D1');
    expect(run.stdout).not.toContain('> Seed official Templates');
    expect(run.stdout).not.toContain('> Seed local test Users');
    expect(run.stdout).toContain('playwright stand-in asked to install chromium');
    expect(await seedStatusOf(copy)).toEqual(EVERYTHING_SEEDED);
  });

  it('stops before installing anything, pointing at dev:stop, when it cannot read what local D1 holds', async () => {
    await queryTheCopysLocalD1(copy, 'ALTER TABLE audit_events RENAME COLUMN id TO event_id');

    const run = await runTheCopysScript(copy, SETUP);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Setup stopped: Could not read the local D1 seed status. If dev:all is running, stop it with `pnpm run dev:stop` and re-run setup. Command failed: ',
    );
    expect(run.stdout).not.toContain('playwright stand-in');
    expect(run.stdout).not.toContain('Setup complete.');
  });
});

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BUSY_LOCAL_D1_STATE, BUSY_LOCAL_D1_STATE_REFUSAL, busyLocalD1StateEnv } from '../../support/busyLocalD1State';
import { aCopyOfTheCheckout, type CheckoutCopy } from '../../support/checkoutCopy';
import { localD1DatabasesOf, runTheCopysScript, seedStatusOf } from '../../support/scriptInACheckoutCopy';

const RESET = 'scripts/d1-reset-local.ts';

const refusalsIn = (stderr: string): number => stderr.split(/\r?\n/).filter((line) => line.startsWith(BUSY_LOCAL_D1_STATE_REFUSAL)).length;

describe('pnpm run db:reset, in a copy of the checkout whose local D1 another process holds', { timeout: 300_000 }, () => {
  let copy: CheckoutCopy;
  let leftover: string;

  beforeAll(async () => {
    copy = await aCopyOfTheCheckout();
    mkdirSync(localD1DatabasesOf(copy), { recursive: true });
    leftover = path.join(localD1DatabasesOf(copy), 'left-by-an-earlier-run.sqlite');
    writeFileSync(leftover, 'an earlier local D1');
  }, 120_000);
  afterAll(() => copy.remove(), 120_000);

  const resetWhileHeld = (code: string, refusals: number) =>
    runTheCopysScript(copy, RESET, { env: { ...process.env, ...busyLocalD1StateEnv(code, refusals) }, preload: BUSY_LOCAL_D1_STATE });

  const advice = () => `Could not reset local D1 state at ${localD1DatabasesOf(copy)}. Stop any running Wrangler/Pages dev process and retry.`;

  it('gives up after five tries, telling the developer to stop the dev servers, while local D1 stays held', async () => {
    const run = await resetWhileHeld('EBUSY', 5);

    expect(run.status).toBe(1);
    expect(refusalsIn(run.stderr)).toBe(5);
    expect(run.stderr).toContain(advice());
    expect(run.stdout).not.toContain('Local D1 reset complete');
    expect(existsSync(leftover)).toBe(true);
  });

  it('stops at the first try when local D1 cannot be deleted for a reason waiting will not fix', async () => {
    const run = await resetWhileHeld('EACCES', 5);

    expect(run.status).toBe(1);
    expect(refusalsIn(run.stderr)).toBe(1);
    expect(run.stderr).toContain(advice());
    expect(existsSync(leftover)).toBe(true);
  });

  it('waits for local D1 to be let go, then replaces it with one built from the migrations and seeds', async () => {
    const run = await resetWhileHeld('EPERM', 2);

    expect(run.status).toBe(0);
    expect(refusalsIn(run.stderr)).toBe(2);
    expect(run.stdout).toContain('Local D1 reset complete');
    expect(existsSync(leftover)).toBe(false);
    expect(await seedStatusOf(copy)).toEqual({ testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aCopyOfTheCheckout, type CheckoutCopy } from '../../support/checkoutCopy';
import { aCopyOfTheCheckoutWithStandIns } from '../../support/checkoutCopyWithStandIns';
import { runTheCopysScript } from '../../support/scriptInACheckoutCopy';
import { giveTheCopyATinySchema, type TinySchemaChanges } from '../../support/tinyD1Schema';
import { aWranglerThatCanAnswerForItself, type WranglerAnswer, wranglerAnswering } from '../../support/wranglerStandIn';

const PARITY_CHECK = 'scripts/data/check-drizzle-schema-parity.ts';

const TINY_TABLES_WITHOUT_THEIR_CREATE_STATEMENTS = [
  { results: ['counters', 'sitemap_revisions', 'templates', 'users'].map((name) => ({ type: 'table', name, tbl_name: name, sql: null })) },
];

describe('pnpm run check:db:drizzle-parity, when a negative control finds nothing to break', { timeout: 300_000 }, () => {
  let copy: CheckoutCopy;

  beforeAll(async () => {
    copy = await aCopyOfTheCheckout();
  }, 120_000);
  afterAll(() => copy.remove(), 120_000);

  it.each<[string, TinySchemaChanges, string]>([
    ['no table has a foreign key to remove', { withoutForeignKeys: true }, 'The negative control needs a table with a foreign key'],
    ['users has no email_verified default to change', { withoutEmailVerified: true }, 'The negative control needs users.email_verified'],
    ['there is no sitemap_revisions table to drop the checks of', { withoutSitemapRevisions: true }, 'sitemap_revisions: missing from the catalog'],
  ])('fails, rather than passing untested, when %s', async (_situation, changes, refusal) => {
    giveTheCopyATinySchema(copy.root, changes);

    const run = await runTheCopysScript(copy, PARITY_CHECK);

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`${refusal}\n`);
    expect(run.stdout).toBe('');
  });
});

describe('pnpm run check:db:drizzle-parity, with a Wrangler whose JSON answer leaves out the rows', { timeout: 300_000 }, () => {
  let copy: CheckoutCopy;

  beforeAll(async () => {
    copy = await aCopyOfTheCheckoutWithStandIns(aWranglerThatCanAnswerForItself());
    giveTheCopyATinySchema(copy.root);
  }, 120_000);
  afterAll(() => copy.remove(), 120_000);

  it.each<[string, WranglerAnswer, string]>([
    ['no result set for the schema objects', { when: 'sqlite_master', answer: [] }, 'no tables loaded; the schema query returned nothing'],
    ['a result set with no rows for the columns', { when: 'pragma_table_info', answer: [{ success: true, meta: {} }] }, 'counters: no columns loaded; the schema query returned nothing'],
    [
      'the tables without their CREATE statements, so no CHECK is left to compare',
      { when: 'sqlite_master', answer: TINY_TABLES_WITHOUT_THEIR_CREATE_STATEMENTS },
      'Missing expected exception (Error): check negative control did not fail',
    ],
  ])('fails, rather than comparing nothing, when Wrangler answers %s', async (_answer, answer, refusal) => {
    const run = await runTheCopysScript(copy, PARITY_CHECK, { env: { ...process.env, ...wranglerAnswering(answer) } });

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`${refusal}\n`);
    expect(run.stdout).toBe('');
  });

  it('compares indexes by whether they are unique or partial when Wrangler lists no columns for any of them', async () => {
    const noIndexColumns: WranglerAnswer = { when: 'pragma_index_info', answer: [{ success: true, meta: {} }] };

    const run = await runTheCopysScript(copy, PARITY_CHECK, { env: { ...process.env, ...wranglerAnswering(noIndexColumns) } });

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe('Drizzle schema parity ok: 5 tables, 1 named indexes, 1 foreign keys, 0 SQL-only triggers.\n');
    expect(run.status).toBe(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readSqlOnlySchema } from '../../../scripts/lib/sql-only-schema';
import { aCopyOfTheCheckout, type CheckoutCopy } from '../../support/checkoutCopy';
import { runTheCopysScript } from '../../support/scriptInACheckoutCopy';
import { runScriptProcess } from '../../support/scriptProcess';
import { giveTheCopyATinySchema } from '../../support/tinyD1Schema';

const PARITY_CHECK = 'scripts/data/check-drizzle-schema-parity.ts';

describe('pnpm run check:db:drizzle-parity, which replays every migration and compares it with the Drizzle schema', { timeout: 900_000 }, () => {
  it('passes the checkout, whose migrations and Drizzle schema agree, and says how much it compared', async () => {
    const run = await runScriptProcess(PARITY_CHECK);

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      new RegExp(`^Drizzle schema parity ok: \\d+ tables, \\d+ named indexes, \\d+ foreign keys, ${readSqlOnlySchema().triggers.length} SQL-only triggers\\.$`, 'm'),
    );
  });

  describe('in a copy of the checkout with a tiny schema', () => {
    let copy: CheckoutCopy;

    beforeAll(async () => {
      copy = await aCopyOfTheCheckout();
    }, 120_000);
    afterAll(() => copy.remove(), 120_000);

    it('passes migrations that write defaults in parentheses, as SQLite keeps them, where Drizzle writes them bare', async () => {
      giveTheCopyATinySchema(copy.root);

      const run = await runTheCopysScript(copy, PARITY_CHECK);

      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('Drizzle schema parity ok: 5 tables, 1 named indexes, 1 foreign keys, 0 SQL-only triggers.\n');
    });

    it('fails, naming the table, when the Drizzle schema has a table the migrations never created', async () => {
      giveTheCopyATinySchema(copy.root, { aTableOnlyTheDrizzleSchemaHas: true });

      const run = await runTheCopysScript(copy, PARITY_CHECK);

      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/^table set differs\n/);
      expect(run.stderr).toContain("+   'notes',");
      expect(run.stdout).toBe('');
    });

    it('fails when a migration creates a trigger the SQL-only schema manifest does not list', async () => {
      giveTheCopyATinySchema(copy.root, { aTriggerOnlyTheMigrationsHave: true });

      const run = await runTheCopysScript(copy, PARITY_CHECK);

      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/^SQL-only trigger manifest differs from migration replay\n/);
      expect(run.stderr).toContain("name: 'templates_count'");
      expect(run.stdout).toBe('');
    });
  });
});

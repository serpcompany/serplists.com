import { readFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';

import { resetLocalTestUserPasswords } from '../../../db/maintenance/local';
import * as schema from '../../../db/schema/index';
import { seedLocalTestData, seedOfficialLocalLogin } from '../../../db/seeds/local';
import { DEV_PASSWORD_HASH, TEST_USER_EMAILS } from '../../../db/seeds/local-test-data/ids';
import { SqliteD1 } from '../../support/sqlite-d1';

const passwordsOf = (d1: SqliteD1) =>
  Object.fromEntries(
    d1.rows(
      `SELECT users.email AS email, users.password_hash AS hash, account.password AS credential
       FROM users LEFT JOIN account ON account.user_id = users.id AND account.provider_id = 'credential'
       ORDER BY users.email`,
    ).map((row) => [String(row['email']), [row['hash'], row['credential']]]),
  );

describe('resetLocalTestUserPasswords', () => {
  it("puts the dev password back on every test user and the official login, and leaves everyone else's alone", async () => {
    const d1 = new SqliteD1();
    const db = drizzle(d1.binding, { schema });
    d1.sqlite.exec(readFileSync(path.join('db', 'seeds', 'official-templates.sql'), 'utf8'));
    await seedLocalTestData(db);
    await seedOfficialLocalLogin(db);
    d1.run(
      `INSERT INTO users (id, email, name, username, email_verified, password_hash, created_at, updated_at)
       VALUES ('someone', 'someone@example.com', 'Someone', 'someone', 1, 'their-own-hash', '2026-01-01', '2026-01-01')`,
    );
    d1.run(`UPDATE users SET password_hash = 'changed' WHERE email <> 'someone@example.com'`);
    d1.run(`UPDATE account SET password = 'changed'`);

    await resetLocalTestUserPasswords(db);

    const passwords = passwordsOf(d1);
    for (const email of [...TEST_USER_EMAILS, 'checklists@serp.co']) {
      expect(passwords[email], email).toEqual([DEV_PASSWORD_HASH, DEV_PASSWORD_HASH]);
    }
    expect(passwords['someone@example.com']).toEqual(['their-own-hash', null]);
  });
});

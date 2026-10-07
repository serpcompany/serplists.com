import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CREATOR, PERSONAL_OWNER, seedProfileOwners, storeProfileTemplate } from '../../support/publicProfiles';
import { SqliteD1 } from '../../support/sqlite-d1';

const LONG_AGO = '2000-01-01 00:00:00.000';
const EVERY_FAMILY = ['categories', 'profiles', 'templates'];

let d1: SqliteD1;

function tablesAndIndexesReadByTrigger(statement: string, trigger: string): string[] {
  const namesByRootPage = new Map(
    d1.rows<{ name: string; rootpage: number }>('SELECT name, rootpage FROM sqlite_master WHERE rootpage > 0')
      .map(({ name, rootpage }) => [rootpage, name]),
  );
  const read = new Set<string>();
  let insideTheTrigger = false;
  for (const { addr, opcode, p2, p4 } of d1.rows<{ addr: number; opcode: string; p2: number; p4: unknown }>(`EXPLAIN ${statement}`)) {
    if (opcode === 'Init' && addr === 0) insideTheTrigger = p4 === `-- TRIGGER ${trigger}`;
    else if (insideTheTrigger && opcode === 'OpenRead') read.add(namesByRootPage.get(p2) ?? `root page ${p2}`);
  }
  return [...read];
}

const revisedSince = (table: string, column: string): string[] =>
  d1.rows<{ value: string }>(`SELECT ${column} AS value FROM ${table} WHERE revised_at > ? ORDER BY ${column}`, LONG_AGO)
    .map(({ value }) => value);

function bumpedBy(write: string, ...params: unknown[]): string[] {
  for (const table of ['sitemap_revisions', 'sitemap_category_revisions']) {
    d1.run(`UPDATE ${table} SET revised_at = ?`, LONG_AGO);
  }
  d1.run(write, ...params);
  return revisedSince('sitemap_revisions', 'kind');
}

beforeEach(() => {
  d1 = new SqliteD1();
  seedProfileOwners(d1);
});

afterEach(() => {
  d1.close();
});

describe("the users sitemap triggers after 0033, which find a User's public Personal Templates through the owner index (TD-86)", () => {
  it.each([
    ['sitemap_users_update_owner', `UPDATE users SET username = 'bob-renamed' WHERE id = '${PERSONAL_OWNER.id}'`],
    ['sitemap_users_delete', `DELETE FROM users WHERE id = '${PERSONAL_OWNER.id}'`],
  ])('%s searches idx_templates_owner, never reading every public Template through idx_templates_public_created_at', (trigger, statement) => {
    const read = tablesAndIndexesReadByTrigger(statement, trigger);

    expect(read).toContain('idx_templates_owner');
    expect(read).not.toContain('idx_templates_public_created_at');
  });

  it("refresh every family and the User's categories when a User with public Personal Templates changes username or name", () => {
    storeProfileTemplate(d1, { id: 'bob-plan', category: '["Procurement"]' });
    storeProfileTemplate(d1, { id: 'bob-draft', category: '["Drafts"]', isPublic: false });
    storeProfileTemplate(d1, { id: 'alice-plan', userId: CREATOR.id, category: '["Travel"]' });

    for (const write of [
      "UPDATE users SET username = 'bob-renamed' WHERE id = ?",
      "UPDATE users SET name = 'Bob Renamed' WHERE id = ?",
    ]) {
      expect(bumpedBy(write, PERSONAL_OWNER.id), write).toEqual(EVERY_FAMILY);
      expect(revisedSince('sitemap_category_revisions', 'category'), write).toEqual(['["Procurement"]']);
    }
  });

  it('refresh only the profiles sitemap for a User whose Templates are private, deleted or Organization ones', () => {
    storeProfileTemplate(d1, { id: 'bob-draft', isPublic: false });
    storeProfileTemplate(d1, { id: 'bob-deleted', deletedAt: '2026-03-01' });
    storeProfileTemplate(d1, { id: 'bob-org-plan', ownerType: 'team', userId: PERSONAL_OWNER.id });

    expect(bumpedBy("UPDATE users SET username = 'bob-renamed' WHERE id = ?", PERSONAL_OWNER.id)).toEqual(['profiles']);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual([]);
  });

  it("refresh every family and the User's categories when a User with public Personal Templates is deleted", () => {
    storeProfileTemplate(d1, { id: 'bob-plan', category: '["Procurement"]' });

    expect(bumpedBy('DELETE FROM users WHERE id = ?', PERSONAL_OWNER.id)).toEqual(EVERY_FAMILY);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual(['["Procurement"]']);
  });

  it('refresh only the profiles sitemap when a User whose Templates are private or deleted is deleted', () => {
    storeProfileTemplate(d1, { id: 'bob-draft', isPublic: false });
    storeProfileTemplate(d1, { id: 'bob-deleted', deletedAt: '2026-03-01' });

    expect(bumpedBy('DELETE FROM users WHERE id = ?', PERSONAL_OWNER.id)).toEqual(['profiles']);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual([]);
  });
});

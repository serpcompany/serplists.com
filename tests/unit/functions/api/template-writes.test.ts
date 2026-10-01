import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@functions/api/db';
import { insertTemplateWithHistoryFallback, isMissingRulesColumnError } from '@functions/api/utils/template-writes';

const values = {
  id: 'template-1',
  user_id: 'user-1',
  title: 'Template',
  items: '[]',
  rules: '[]',
  owner_type: 'user',
  created_at: 'now',
  updated_at: 'now',
} satisfies typeof schema.templates.$inferInsert;
const versionValues = {
  id: 'version-1',
  template_id: 'template-1',
  version: 1,
  changed_by_user_id: 'user-1',
  subject_type: 'user',
  subject_id: 'user-1',
  snapshot_json: '{}',
  created_at: 'now',
} satisfies typeof schema.template_versions.$inferInsert;
const auditValues = {
  id: 'audit-1',
  subject_type: 'user',
  subject_id: 'user-1',
  resource_type: 'template',
  resource_id: 'template-1',
  action: 'template.created',
  created_at: 'now',
} satisfies typeof schema.audit_events.$inferInsert;

type BuiltQuery = { toSQL(): { sql: string; params: unknown[] } };

function databaseWithoutRulesColumn() {
  const db = drizzle({} as D1Database, { schema });
  const batches: Array<Array<{ sql: string; params: unknown[] }>> = [];
  const batch = vi.fn(async (statements: BuiltQuery[]) => {
    const built = statements.map((statement) => statement.toSQL());
    batches.push(built);
    if (built.some((query) => /"rules"/.test(query.sql))) {
      throw new Error('D1_ERROR: table templates has no column named rules: SQLITE_ERROR');
    }
    return built.map(() => ({ meta: { changes: 1 } }));
  });
  return { db: Object.assign(db, { batch }) as never, batches };
}

describe('insertTemplateWithHistoryFallback without the rules column', () => {
  it('retries a limit-guarded insert without naming rules, still guarded by the template limit and writing the given values', async () => {
    const { db, batches } = databaseWithoutRulesColumn();

    const inserted = await insertTemplateWithHistoryFallback(db, values, versionValues, auditValues, {
      owner: { userId: 'user-1', teamId: null },
      limit: 1,
    });

    expect(inserted).toBe(true);
    expect(batches).toHaveLength(2);
    const [templateInsert] = batches[1];
    expect(templateInsert.sql).toMatch(/^insert into "templates" \(/);
    expect(templateInsert.sql).not.toContain('"rules"');
    expect(templateInsert.sql).toMatch(/where \(select count\(\*\) from "templates" where .*\) < \?$/);
    expect(templateInsert.params).toEqual(expect.arrayContaining(['template-1', 'user-1', 'Template']));
  });

  it('retries a plain insert without naming rules', async () => {
    const { db, batches } = databaseWithoutRulesColumn();

    expect(await insertTemplateWithHistoryFallback(db, values, versionValues, auditValues)).toBe(true);

    expect(batches).toHaveLength(2);
    expect(batches[1][0].sql).toMatch(/^insert into "templates" \(/);
    expect(batches[1][0].sql).not.toContain('"rules"');
    expect(batches[1][0].params).toEqual(expect.arrayContaining(['template-1', 'user-1', 'Template']));
  });

  it('writes rules on the first attempt when the column exists', async () => {
    const db = drizzle({} as D1Database, { schema });
    const batch = vi.fn(async (statements: BuiltQuery[]) => statements.map(() => ({ meta: { changes: 1 } })));
    Object.assign(db, { batch });

    await insertTemplateWithHistoryFallback(db as never, values, versionValues, auditValues);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0][0].toSQL().sql).toContain('"rules"');
  });
});

describe('isMissingRulesColumnError', () => {
  it('recognizes the SQLite missing-column errors of reads, updates and inserts', () => {
    expect(isMissingRulesColumnError(new Error('D1_ERROR: no such column: rules: SQLITE_ERROR'))).toBe(true);
    expect(isMissingRulesColumnError(new Error('no such column: "templates"."rules"'))).toBe(true);
    expect(isMissingRulesColumnError(new Error('D1_ERROR: table templates has no column named rules: SQLITE_ERROR'))).toBe(true);
    expect(isMissingRulesColumnError(new Error('D1_ERROR: table templates has no column named rules_v2'))).toBe(false);
    expect(isMissingRulesColumnError(new Error('UNIQUE constraint failed: templates.slug'))).toBe(false);
  });
});

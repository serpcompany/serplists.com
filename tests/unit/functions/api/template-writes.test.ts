import { describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { d1ThatRunsNoQuery } from '../../../support/apiEnv';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@functions/api/db';
import { insertTemplateWithHistoryFallback } from '@functions/api/utils/template-writes';

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
} satisfies typeof schema.templateVersions.$inferInsert;
const auditValues = {
  id: 'audit-1',
  subject_type: 'user',
  subject_id: 'user-1',
  resource_type: 'template',
  resource_id: 'template-1',
  action: 'template.created',
  created_at: 'now',
} satisfies typeof schema.auditEvents.$inferInsert;

type BuiltQuery = { toSQL(): { sql: string; params: unknown[] } };

describe('insertTemplateWithHistoryFallback', () => {
  it('writes the template with its rules, its first version and its audit event in one batch', async () => {
    const db = drizzle(d1ThatRunsNoQuery(), { schema });
    const batch = vi.fn(async (statements: BuiltQuery[]) => statements.map(() => ({ meta: { changes: 1 } })));
    Object.assign(db, { batch });

    await insertTemplateWithHistoryFallback(db, values, versionValues, auditValues);

    expect(batch).toHaveBeenCalledTimes(1);
    const statements = firstOf(batch.mock.calls)[0].map((statement) => statement.toSQL().sql);
    expect(statements.map((statement) => statement.slice(0, statement.indexOf(' ('))))
      .toEqual(['insert into "templates"', 'insert into "template_versions"', 'insert into "audit_events"']);
    expect(firstOf(statements)).toContain('"rules"');
  });
});

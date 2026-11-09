import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateUniqueSlug } from '@functions/api/utils/template-insert';
import { apiEnvOn } from '../../../support/apiEnv';
import { SqliteD1 } from '../../../support/sqlite-d1';

const TEMPLATE_ID = '12345678-template';
let d1: SqliteD1;

function storeTemplateWithSlug(id: string, slug: string) {
  d1.run(
    "INSERT INTO templates (id, user_id, title, items, slug, created_at, owner_type) VALUES (?, 'user-1', 'Launch', '[]', ?, '2026-01-01', 'user')",
    id, slug,
  );
}

beforeEach(() => {
  d1 = new SqliteD1();
  d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, '2026-01-01')");
});

afterEach(() => {
  d1.close();
});

describe('generateUniqueSlug', () => {
  it('takes the title’s slug while it is free', async () => {
    await expect(generateUniqueSlug(apiEnvOn(d1), 'Launch Plan', TEMPLATE_ID)).resolves.toBe('launch-plan');
  });

  it('suffixes the template id when another template has the title’s slug', async () => {
    storeTemplateWithSlug('other-1', 'launch-plan');

    await expect(generateUniqueSlug(apiEnvOn(d1), 'Launch Plan', TEMPLATE_ID)).resolves.toBe('launch-plan-12345678');
  });

  it('falls back to a random suffix when the id-suffixed slug is taken as well', async () => {
    storeTemplateWithSlug('other-1', 'launch-plan');
    storeTemplateWithSlug('other-2', 'launch-plan-12345678');

    const slug = await generateUniqueSlug(apiEnvOn(d1), 'Launch Plan', TEMPLATE_ID);

    expect(slug).toMatch(/^launch-plan-[0-9a-f]{8}$/);
    expect(slug).not.toBe('launch-plan-12345678');
  });
});

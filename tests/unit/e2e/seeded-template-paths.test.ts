import { drizzle } from 'drizzle-orm/d1';
import { beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../../../db/schema/index';
import { seedLocalTestData } from '../../../db/seeds/local';
import {
  DELIBERATELY_MISSING_PREFIX,
  E2E_TEMPLATE_API_SLUGS,
  E2E_TEMPLATE_PAGES,
} from '../../../scripts/eslint-rules/code-conventions';
import { SqliteD1 } from '../../support/sqlite-d1';
import { repoTemplates, resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';

const ownerAndSlug = (owner: string, slug: string) => `${owner.toLowerCase()}/${slug}`;

let openableOwnersAndSlugs = new Set<string>();
let slugsTheApiAnswers = new Set<string>();

beforeAll(async () => {
  const d1 = new SqliteD1();
  await seedLocalTestData(drizzle(d1.binding, { schema }));
  const seeded = d1.rows<{ username: string; slug: string }>(
    'SELECT users.username AS username, templates.slug AS slug FROM templates ' +
      'JOIN users ON users.id = templates.user_id WHERE templates.slug IS NOT NULL ' +
      'UNION SELECT teams.slug, templates.slug FROM templates ' +
      "JOIN teams ON templates.owner_type = 'team' AND teams.id = templates.team_id WHERE templates.slug IS NOT NULL",
  );
  const bundled = repoTemplates.flatMap((template) => {
    const owner = resolvePublicTemplateOwnerSlug(template);
    return template.isPublic && owner && template.slug ? [{ username: owner, slug: template.slug }] : [];
  });
  openableOwnersAndSlugs = new Set([...seeded, ...bundled].map(({ username, slug }) => ownerAndSlug(username, slug)));
  slugsTheApiAnswers = new Set(seeded.map(({ slug }) => slug));
});

describe('the Templates the browser tests may open (E2E_TEMPLATE_PAGES and E2E_TEMPLATE_API_SLUGS)', () => {
  it('are all on the e2e stack, seeded by seed-test or bundled in src/data', () => {
    expect(E2E_TEMPLATE_PAGES.filter((page) => !openableOwnersAndSlugs.has(page.toLowerCase()))).toEqual([]);
  });

  it('ask the API only for slugs seed-test puts in D1, which the API answers', () => {
    expect(E2E_TEMPLATE_API_SLUGS.filter((slug) => !slugsTheApiAnswers.has(slug))).toEqual([]);
  });

  it('include no seeded or bundled owner or Template named with the no-such- prefix, so such a path is always missing', () => {
    const names = [...openableOwnersAndSlugs].flatMap((key) => key.split('/'));

    expect(names.filter((name) => name.startsWith(DELIBERATELY_MISSING_PREFIX))).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../../../db/schema/index';
import { seedLocalTestData } from '../../../db/seeds/local';
import type { LocalDb } from '../../../scripts/data/local-d1';
import { MigratedSqliteD1 } from '../../support/sqlite-d1';
import { repoTemplates, resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';

const E2E_DIR = path.join('tests', 'e2e');
const DELIBERATELY_MISSING_PREFIX = 'no-such-';
const SLUG = '[A-Za-z0-9_-]+';
const LITERAL_SEGMENT_END = '(?![A-Za-z0-9_$-])';
const LITERAL_PROFILE_PATH = new RegExp(`/profile/(${SLUG})/(${SLUG})${LITERAL_SEGMENT_END}`, 'g');
const LITERAL_API_SLUG_PATH = new RegExp(`/templates/slug/(${SLUG})${LITERAL_SEGMENT_END}`, 'g');

type Reference = { file: string; line: number; path: string; owner?: string; slug: string };

function isDeliberatelyMissing({ owner, slug }: Reference) {
  return [owner, slug].some((name) => name?.startsWith(DELIBERATELY_MISSING_PREFIX));
}

function templateReferences(file: string, source: string): Reference[] {
  return source.split('\n').flatMap((text, index) => {
    const at = { file, line: index + 1 };
    const references: Reference[] = [
      ...Array.from(text.matchAll(LITERAL_PROFILE_PATH), (match) => ({ ...at, path: match[0], owner: match[1], slug: match[2] })),
      ...Array.from(text.matchAll(LITERAL_API_SLUG_PATH), (match) => ({ ...at, path: match[0], slug: match[1] })),
    ];
    return references.filter((reference) => !isDeliberatelyMissing(reference));
  });
}

function e2eSourceFiles() {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(E2E_DIR, name).split(path.sep).join('/'))
    .sort();
}

const ownerAndSlug = (owner: string, slug: string) => `${owner.toLowerCase()}/${slug}`;

let openableOwnersAndSlugs = new Set<string>();
let slugsTheApiAnswers = new Set<string>();

beforeAll(async () => {
  const d1 = new MigratedSqliteD1();
  await seedLocalTestData(drizzle(d1.binding as Parameters<typeof drizzle>[0], { schema }) as unknown as LocalDb);
  const seeded = d1.rows<{ username: string; slug: string }>(
    'SELECT users.username AS username, templates.slug AS slug FROM templates ' +
      'JOIN users ON users.id = templates.user_id WHERE templates.slug IS NOT NULL',
  );
  const bundled = repoTemplates.flatMap((template) => {
    const owner = resolvePublicTemplateOwnerSlug(template);
    return template.isPublic && owner && template.slug ? [{ username: owner, slug: template.slug }] : [];
  });
  openableOwnersAndSlugs = new Set([...seeded, ...bundled].map(({ username, slug }) => ownerAndSlug(username, slug)));
  slugsTheApiAnswers = new Set(seeded.map(({ slug }) => slug));
});

describe('Template paths in the browser tests', () => {
  it('knows the seeded and bundled Templates', () => {
    expect(openableOwnersAndSlugs).toContain('admin/sample-technical-seo-audit-checklist');
    expect(openableOwnersAndSlugs).toContain('serp/ultimate-camping-checklist');
    expect(slugsTheApiAnswers).toContain('sample-technical-seo-audit-checklist');
  });

  it('has no seeded or bundled owner or Template named with the no-such- prefix, so such a path is always missing', () => {
    const names = [...openableOwnersAndSlugs].flatMap((key) => key.split('/'));

    expect(names.filter((name) => name.startsWith(DELIBERATELY_MISSING_PREFIX))).toEqual([]);
  });

  it('reads literal paths and skips built ones and those named no-such-', () => {
    const source = [
      "await page.goto('/profile/admin/old-slug?x=1');",
      'await page.goto(`/profile/admin/${created.slug}`);',
      "await page.goto('/profile/serp/no-such-template/');",
      "await page.goto('/profile/no-such-user/sample-technical-seo-audit-checklist/');",
      "if (path === '/api/templates/slug/old-slug') {}",
      "if (path === '/api/templates/slug/no-such-slug') {}",
    ].join('\n');

    expect(templateReferences('example.spec.ts', source)).toEqual([
      { file: 'example.spec.ts', line: 1, path: '/profile/admin/old-slug', owner: 'admin', slug: 'old-slug' },
      { file: 'example.spec.ts', line: 5, path: '/templates/slug/old-slug', slug: 'old-slug' },
    ]);
  });

  it('opens only Templates the e2e stack has', () => {
    const references = e2eSourceFiles().flatMap((file) => templateReferences(file, readFileSync(file, 'utf8')));
    const missing = references
      .filter(({ owner, slug }) =>
        owner === undefined ? !slugsTheApiAnswers.has(slug) : !openableOwnersAndSlugs.has(ownerAndSlug(owner, slug)))
      .map(({ file, line, path: templatePath }) => `${file}:${line} ${templatePath}`);

    expect(references.length).toBeGreaterThan(0);
    expect(
      missing,
      'These specs open a Template that `seed-test` (db/seeds/local.ts) does not create and src/data does not bundle. ' +
        'Use a seeded or bundled Template, or create one in the test. A path that must be missing names its user or ' +
        `Template with the \`${DELIBERATELY_MISSING_PREFIX}\` prefix, as in \`/profile/serp/no-such-template/\`.`,
    ).toEqual([]);
  });
});

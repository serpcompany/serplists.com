import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../../../db/schema/index';
import { seedLocalTestData } from '../../../db/seeds/local';
import type { LocalDb } from '../../../scripts/data/local-d1';
import { SqliteD1 } from '../../support/sqlite-d1';
import { repoTemplates, resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';

// The browser tests run on a D1 that tests/e2e/run-smoke.mjs seeds with `seed-test` only
// (db/seeds/local.ts), plus the Templates bundled in src/data. A spec that opens
// /profile/<user>/<slug> for any other Template finds "Template not found": the seed renamed
// admin's Templates to sample-* slugs once, and three specs kept the old slug until the
// full suite ran. A path that is meant to be missing carries an `e2e-unseeded-template:`
// comment on its line or in the comment lines just above it.

const E2E_DIR = path.join('tests', 'e2e');
const MARKER = /e2e-unseeded-template:\s*\S/;
const SLUG = '[A-Za-z0-9_-]+';
// Literal segments only: a `${...}` segment is built at run time and is not checked here.
const PROFILE_PATH = new RegExp(`/profile/(${SLUG})/(${SLUG})(?![A-Za-z0-9_$-])`, 'g');
const API_SLUG_PATH = new RegExp(`/templates/slug/(${SLUG})(?![A-Za-z0-9_$-])`, 'g');

type Reference = { file: string; line: number; path: string; owner?: string; slug: string };

function hasMarker(lines: string[], index: number) {
  if (MARKER.test(lines[index])) return true;
  for (let above = index - 1; above >= 0 && lines[above].trim().startsWith('//'); above -= 1) {
    if (MARKER.test(lines[above])) return true;
  }
  return false;
}

function templateReferences(file: string, source: string): Reference[] {
  const lines = source.split('\n');
  return lines.flatMap((text, index) => {
    if (hasMarker(lines, index)) return [];
    const at = { file, line: index + 1 };
    return [
      ...Array.from(text.matchAll(PROFILE_PATH), (match) => ({ ...at, path: match[0], owner: match[1], slug: match[2] })),
      ...Array.from(text.matchAll(API_SLUG_PATH), (match) => ({ ...at, path: match[0], slug: match[1] })),
    ];
  });
}

function e2eSourceFiles() {
  return readdirSync(E2E_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(E2E_DIR, name).split(path.sep).join('/'))
    .sort();
}

// Every Template a spec can open on the e2e stack, as "owner/slug", and the seeded slugs
// the API answers by slug.
let openable = new Set<string>();
let seededSlugs = new Set<string>();

beforeAll(async () => {
  const d1 = new SqliteD1();
  await seedLocalTestData(drizzle(d1.binding as Parameters<typeof drizzle>[0], { schema }) as unknown as LocalDb);
  const seeded = d1.rows<{ username: string; slug: string }>(
    'SELECT users.username AS username, templates.slug AS slug FROM templates ' +
      'JOIN users ON users.id = templates.user_id WHERE templates.slug IS NOT NULL',
  );
  const bundled = repoTemplates.flatMap((template) => {
    const owner = resolvePublicTemplateOwnerSlug(template);
    return template.isPublic && owner && template.slug ? [{ username: owner, slug: template.slug }] : [];
  });
  openable = new Set([...seeded, ...bundled].map(({ username, slug }) => `${username.toLowerCase()}/${slug}`));
  seededSlugs = new Set(seeded.map(({ slug }) => slug));
});

describe('Template paths in the browser tests', () => {
  it('knows the seeded and bundled Templates', () => {
    expect(openable).toContain('admin/sample-technical-seo-audit-checklist');
    expect(openable).toContain('serp/ultimate-camping-checklist');
    expect(seededSlugs).toContain('sample-technical-seo-audit-checklist');
  });

  it('reads literal paths and skips built or marked ones', () => {
    const source = [
      "await page.goto('/profile/admin/old-slug?x=1');",
      'await page.goto(`/profile/admin/${created.slug}`);',
      "// e2e-unseeded-template: checks the not-found page.",
      "await page.goto('/profile/serp/no-such-template');",
      "if (path === '/api/templates/slug/old-slug') {}",
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
        owner === undefined ? !seededSlugs.has(slug) : !openable.has(`${owner.toLowerCase()}/${slug}`))
      .map(({ file, line, path: templatePath }) => `${file}:${line} ${templatePath}`);

    expect(references.length).toBeGreaterThan(0);
    expect(
      missing,
      'These specs open a Template that `seed-test` (db/seeds/local.ts) does not create and src/data does not bundle. ' +
        'Use a seeded or bundled Template, create one in the test, or mark a deliberately missing one with an ' +
        '`e2e-unseeded-template:` comment.',
    ).toEqual([]);
  });
});

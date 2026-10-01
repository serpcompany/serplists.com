import { assert, describe, expect, it } from 'vitest';
import { lastOf } from '../../support/elements';

import { PUBLIC_CATEGORY_REGISTRY } from '@/data/publicCategories';
import {
  buildCategorySlug,
  buildPublicCategoryPath,
  findCategoryNameBySlug,
  resolveLegacyTemplatesCategoryRedirectPath,
} from '@/lib/routes';
import { generateSlug } from '@/utils/urlHelpers';

import { CATEGORY_SLUG_FIXTURES } from '../../fixtures/categorySlugFixtures';

const categorySlugInPath = (path: string) => decodeURIComponent(lastOf(path.split('/').filter(Boolean)));

describe('buildCategorySlug, which keeps the letters of every script so no two categories share an empty slug', () => {
  it.each([
    ['日本語', '日本語'],
    ['Русский', 'русский'],
    ['Путешествия', 'путешествия'],
    ['Мой дом', 'мой-дом'],
    ['ガイド', 'ガイド'],
    ['한국어 가이드', '한국어-가이드'],
    ['हिन्दी', 'हिन्दी'],
    ['Café Culture', 'cafe-culture'],
    ['  Mixed Ünïcode  ', 'mixed-unicode'],
    ['İstanbul', 'istanbul'],
    ['ＳＥＯ Ｔｏｏｌｓ', 'seo-tools'],
    ['日本語 Guide', '日本語-guide'],
  ])('gives %j the slug %j', (name, slug) => {
    expect(buildCategorySlug(name)).toBe(slug);
  });

  it.each(['!!!', '🚀', '🚀 🔥', '---', '   ', '_'])('gives %j no slug', (name) => {
    expect(buildCategorySlug(name)).toBe('');
  });

  it('keeps every existing ASCII slug unchanged', () => {
    ['Technical SEO', ' SEO & Analytics ', 'Home-Inspection', 'C++', 'wedding!', 'Morning Routine', 'a_b']
      .forEach((name) => expect(buildCategorySlug(name)).toBe(generateSlug(name.trim())));
    PUBLIC_CATEGORY_REGISTRY.forEach((entry) => {
      expect(buildCategorySlug(entry.slug)).toBe(entry.slug);
    });
  });

  it('is idempotent and ignores the Unicode normal form of the input', () => {
    CATEGORY_SLUG_FIXTURES.forEach((name) => {
      const slug = buildCategorySlug(name);
      expect(buildCategorySlug(slug)).toBe(slug);
      expect(buildCategorySlug(name.normalize('NFD'))).toBe(slug);
      expect(buildCategorySlug(name.normalize('NFC'))).toBe(slug);
    });
  });

  it('gives distinct scripts distinct slugs', () => {
    expect(buildCategorySlug('日本語')).not.toBe(buildCategorySlug('Русский'));
  });
});

describe('buildPublicCategoryPath', () => {
  it('links each Unicode category to a path that resolves back to it', () => {
    const named = CATEGORY_SLUG_FIXTURES.filter((name) => buildCategorySlug(name));
    named.forEach((name) => {
      const path = buildPublicCategoryPath(name);
      assert.exists(path);
      expect(findCategoryNameBySlug(named, categorySlugInPath(path))).toBe(
        named.find((candidate) => buildCategorySlug(candidate) === buildCategorySlug(name)),
      );
    });
    expect(buildPublicCategoryPath('日本語')).toBe('/categories/%E6%97%A5%E6%9C%AC%E8%AA%9E/');
  });

  it('gives a category with no letters or digits no page', () => {
    expect(buildPublicCategoryPath('!!!')).toBeNull();
    expect(buildPublicCategoryPath('🚀')).toBeNull();
    expect(resolveLegacyTemplatesCategoryRedirectPath(new URLSearchParams('category=!!!'))).toBeNull();
  });

  it('redirects a legacy ?category= query with a Unicode name', () => {
    expect(resolveLegacyTemplatesCategoryRedirectPath(new URLSearchParams('category=Русский'))).toBe(
      `/categories/${encodeURIComponent('русский')}/`,
    );
  });
});

import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DocumentHeadProvider } from '@/components/shared/DocumentHeadProvider';
import { SEOHead } from '@/components/shared/SEOHead';

// index.html ships static description, Open Graph and Twitter tags for crawlers that do
// not run JavaScript. react-helmet-async only manages tags marked data-rh, so unmarked
// static tags stayed next to SEOHead's: every SEO page had two descriptions, the generic
// one first. The static tags are now marked, and the app mounts the same values as
// defaults, so each tag exists once on every page.

type Tag = Record<string, string>;

const parseMetaTags = (html: string): Tag[] =>
  [...html.matchAll(/<meta\b([^>]*?)\/?>/g)].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]])),
  );

const indexHtmlHead = (): Tag[] => {
  const html = readFileSync('index.html', 'utf8');
  return parseMetaTags(html.slice(0, html.indexOf('</head>')));
};

const helmetMetaTags = (children: React.ReactNode): Tag[] => {
  const context: { helmet?: { meta: { toString(): string } } } = {};
  renderToStaticMarkup(<DocumentHeadProvider context={context}>{children}</DocumentHeadProvider>);
  return parseMetaTags(context.helmet!.meta.toString());
};

const sameNode = (left: Tag, right: Tag) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([name, value]) => right[name] === value);

// What react-helmet-async's updateTags does to <head> on each commit: existing tags marked
// data-rh are kept when an identical tag is wanted and removed otherwise; unmarked tags are
// never touched; wanted tags that were not kept are appended.
const commitHelmet = (head: Tag[], wanted: Tag[]): Tag[] => {
  const unmatched = head.filter((tag) => 'data-rh' in tag);
  const appended = wanted.filter((tag) => {
    const index = unmatched.findIndex((existing) => sameNode(existing, tag));
    if (index === -1) return true;
    unmatched.splice(index, 1);
    return false;
  });
  return [...head.filter((tag) => !unmatched.includes(tag)), ...appended];
};

const tagsFor = (head: Tag[], key: string) =>
  head.filter((tag) => tag.name === key || tag.property === key);

const SEO_KEYS = [
  'description',
  'og:title',
  'og:description',
  'og:type',
  'og:image',
  'twitter:card',
  'twitter:image',
  'viewport',
];

const templatePage = (
  <SEOHead
    description="Pack for three nights in the backcountry."
    title="Ultimate Camping Checklist"
    type="article"
    url="https://serplists.com/profile/serp/ultimate-camping-checklist"
  />
);

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://serplists.com', pathname: '/profile/serp/ultimate-camping-checklist' } },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('document head meta tags', () => {
  it('leaves one of each tag on an SEOHead page, with the page values', () => {
    const head = commitHelmet(indexHtmlHead(), helmetMetaTags(templatePage));

    SEO_KEYS.forEach((key) => expect(tagsFor(head, key), key).toHaveLength(1));
    expect(tagsFor(head, 'description')[0].content).toBe('Pack for three nights in the backcountry.');
    expect(tagsFor(head, 'og:type')[0].content).toBe('article');
    expect(tagsFor(head, 'og:title')[0].content).toBe('Ultimate Camping Checklist | SERP Lists');
  });

  it('keeps the static defaults untouched on a page without SEOHead', () => {
    const staticHead = indexHtmlHead();
    const head = commitHelmet(staticHead, helmetMetaTags(<main>Pricing</main>));

    expect(head).toEqual(staticHead);
  });

  it('restores the defaults after leaving an SEOHead page', () => {
    const onTemplatePage = commitHelmet(indexHtmlHead(), helmetMetaTags(templatePage));
    const onPricing = commitHelmet(onTemplatePage, helmetMetaTags(<main>Pricing</main>));

    SEO_KEYS.forEach((key) => expect(tagsFor(onPricing, key), key).toHaveLength(1));
    expect(tagsFor(onPricing, 'description')[0].content).toBe(tagsFor(indexHtmlHead(), 'description')[0].content);
    expect(tagsFor(onPricing, 'twitter:title')).toHaveLength(0);
  });

  it('marks exactly the SEO tags in index.html as Helmet-managed', () => {
    const head = indexHtmlHead();
    const managed = head.filter((tag) => 'data-rh' in tag);

    managed.forEach((tag) => expect(tag['data-rh']).toBe('true'));
    head
      .filter((tag) => tag.name === 'description' || tag.name?.startsWith('twitter:') || tag.property?.startsWith('og:'))
      .forEach((tag) => expect(tag, JSON.stringify(tag)).toHaveProperty('data-rh', 'true'));
    // The viewport and charset are global: Helmet would remove them with the last page.
    expect(tagsFor(head, 'viewport')[0]).not.toHaveProperty('data-rh');
    expect(head.find((tag) => 'charset' in tag)).not.toHaveProperty('data-rh');
  });

  it('keeps the static tags and the app defaults identical, so crawlers and the app agree', () => {
    const managed = indexHtmlHead().filter((tag) => 'data-rh' in tag);
    const defaults = helmetMetaTags(<main>Pricing</main>);

    expect(defaults).toHaveLength(managed.length);
    defaults.forEach((tag) => expect(managed.some((existing) => sameNode(existing, tag)), JSON.stringify(tag)).toBe(true));
    managed
      .filter((tag) => tag.property === 'og:image' || tag.name === 'twitter:image')
      .forEach((tag) => expect(tag.content).toMatch(/^https:\/\//));
  });

  it('never manages the viewport from SEOHead', () => {
    expect(tagsFor(helmetMetaTags(templatePage), 'viewport')).toHaveLength(0);
  });
});

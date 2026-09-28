import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_BRAND_NAME, buildPageTitle } from '@/lib/brand';

describe('buildPageTitle', () => {
  it('adds the brand to a page title', () => {
    expect(buildPageTitle('Discover Templates')).toBe(`Discover Templates | ${APP_BRAND_NAME}`);
  });

  it('does not add the brand twice', () => {
    expect(buildPageTitle(APP_BRAND_NAME)).toBe(APP_BRAND_NAME);
    expect(buildPageTitle(`Pricing | ${APP_BRAND_NAME}`)).toBe(`Pricing | ${APP_BRAND_NAME}`);
  });

  it('still adds the brand when a title only mentions it', () => {
    expect(buildPageTitle(`${APP_BRAND_NAME} onboarding`)).toBe(
      `${APP_BRAND_NAME} onboarding | ${APP_BRAND_NAME}`,
    );
  });

  it('falls back to the brand for a missing or blank title', () => {
    expect(buildPageTitle(undefined)).toBe(APP_BRAND_NAME);
    expect(buildPageTitle('   ')).toBe(APP_BRAND_NAME);
    expect(buildPageTitle('  Run title  ')).toBe(`Run title | ${APP_BRAND_NAME}`);
  });
});

describe('brand name in the app', () => {
  it('never uses the old placeholder brand', () => {
    const offenders = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .map((file) => path.join('src', file))
      .filter((file) => /\.(tsx?|html|css|json)$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('Checklist App'));

    expect(offenders).toEqual([]);
  });
});

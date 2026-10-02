import { describe, expect, it } from 'vitest';

import { templatePackModules } from '@/data/public-template-packs';
import { APP_BRAND_NAME, buildPageTitle, SITE_DEFAULT_DESCRIPTION } from '@/lib/brand';

describe('buildPageTitle', () => {
  it('adds the brand to a page title', () => {
    expect(buildPageTitle('Template Library')).toBe(`Template Library | ${APP_BRAND_NAME}`);
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
    const packs = Object.values(templatePackModules).map((pack) => JSON.stringify(pack));
    const shipped = [APP_BRAND_NAME, SITE_DEFAULT_DESCRIPTION, buildPageTitle(undefined), ...packs];

    expect(Object.keys(templatePackModules).length).toBeGreaterThan(0);
    expect(shipped.filter((text) => text.includes('Checklist App'))).toEqual([]);
  });
});

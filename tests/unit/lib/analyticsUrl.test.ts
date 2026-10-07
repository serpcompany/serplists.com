import { describe, expect, it } from 'vitest';

import {
  isSensitiveAnalyticsLocation,
  isTagManagerLoaded,
  needsFullPageLoad,
} from '@/lib/analyticsUrl';

import {
  SAFE_ANALYTICS_LOCATIONS,
  SENSITIVE_ANALYTICS_LOCATIONS,
} from '../../fixtures/analyticsLocations';

describe('isSensitiveAnalyticsLocation', () => {
  it.each(SENSITIVE_ANALYTICS_LOCATIONS)('keeps analytics off %s%s', (pathname, search) => {
    expect(isSensitiveAnalyticsLocation(pathname, search)).toBe(true);
  });

  it.each(SAFE_ANALYTICS_LOCATIONS)('allows analytics on %s%s', (pathname, search) => {
    expect(isSensitiveAnalyticsLocation(pathname, search)).toBe(false);
  });
});

describe('needsFullPageLoad', () => {
  const withTagManager = { dataLayer: [{ 'gtm.start': 1, event: 'gtm.js' }] };
  const withoutTagManager = {};

  it("reports whether the root layout's Tag Manager bootstrap loaded the container", () => {
    expect(isTagManagerLoaded(withTagManager)).toBe(true);
    expect(isTagManagerLoaded(withoutTagManager)).toBe(false);
    expect(isTagManagerLoaded({ dataLayer: [{ event: 'custom' }, null] })).toBe(false);
    expect(isTagManagerLoaded({ dataLayer: 'not-an-array' })).toBe(false);
  });

  it('asks for a new document before showing a sensitive URL to running tags', () => {
    expect(needsFullPageLoad('/team-invites/invite-token', '', withTagManager)).toBe(true);
    expect(needsFullPageLoad('/share/abc', '', withTagManager)).toBe(true);
  });

  it('keeps client-side navigation when no tags run or the URL is safe', () => {
    expect(needsFullPageLoad('/team-invites/invite-token', '', withoutTagManager)).toBe(false);
    expect(needsFullPageLoad('/account', '', withTagManager)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { publicSiteLinks } from '@/components/layout/publicSiteLinks';

describe('public site links', () => {
  it('models header and footer placement from one shared config', () => {
    expect(publicSiteLinks).toContainEqual({
      href: '/checklists',
      label: 'Checklists',
      placements: ['header'],
    });

    expect(publicSiteLinks).toContainEqual({
      footerGroup: 'Company',
      href: '/about',
      label: 'About',
      placements: ['footer'],
    });

    expect(publicSiteLinks).toContainEqual({
      external: true,
      footerGroup: 'Network',
      href: 'https://serp.dr',
      label: 'SERP DR',
      placements: ['footer'],
    });
  });
});

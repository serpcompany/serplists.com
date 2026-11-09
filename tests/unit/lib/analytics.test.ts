import { describe, expect, it, vi } from 'vitest';

import { analytics } from '@/lib/analytics';

describe('the analytics on the server', () => {
  it('loads during a server render without listening for anything, and keeps no events', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    analytics.trackTemplateView('template-1', 'Launch plan');

    expect(analytics.getEvents()).toEqual([]);
    expect(info).not.toHaveBeenCalled();
  });
});

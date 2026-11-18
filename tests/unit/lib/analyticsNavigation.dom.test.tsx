import { describe, expect, it, vi } from 'vitest';

import { analytics } from '@/lib/analytics';
import { objectContaining } from '../../support/asymmetricMatchers';

vi.spyOn(console, 'info').mockImplementation(() => undefined);

const pageViews = () => analytics.getEvents().filter(({ event }) => event === 'page_view').map(({ properties }) => properties);

describe('page views on client-side navigation', () => {
  it('records the page a visitor lands on, then one view per history change once the address has changed', async () => {
    expect(pageViews()).toHaveLength(1);

    window.history.pushState(null, '', '/templates/launch-day/');
    window.history.replaceState(null, '', '/templates/launch-day/?tab=runs');
    await vi.waitFor(() => expect(pageViews()).toHaveLength(3));
    expect(pageViews().slice(1)).toEqual([
      objectContaining({ path: '/templates/launch-day/', search: '?tab=runs' }),
      objectContaining({ path: '/templates/launch-day/', search: '?tab=runs' }),
    ]);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pageViews()).toHaveLength(4);
  });
});

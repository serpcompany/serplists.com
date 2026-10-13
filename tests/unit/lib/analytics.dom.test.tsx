import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analytics } from '@/lib/analytics';
import { objectContaining } from '../../support/asymmetricMatchers';

const MAX_EVENTS_KEPT = 100;

vi.hoisted(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

function watchEveryWayToSend() {
  const fetchSpy = vi.fn();
  const sendBeacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
  const xhrSend = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', fetchSpy);
  return () => [fetchSpy, sendBeacon, xhrSend].map((send) => send.mock.calls.length);
}

describe('the in-memory analytics', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps at most 100 events in the tab's memory and sends none of them anywhere", () => {
    const sends = watchEveryWayToSend();

    for (let view = 0; view < 150; view += 1) analytics.trackTemplateView(`template-${view}`, 'Launch plan');

    const events = analytics.getEvents();
    expect(events).toHaveLength(MAX_EVENTS_KEPT);
    expect(events.at(-1)?.properties).toEqual({ templateId: 'template-149', templateTitle: 'Launch plan' });
    expect(sends()).toEqual([0, 0, 0]);
  });

  it('keeps window errors and rejections, with message and URL, and sends none', () => {
    const sends = watchEveryWayToSend();
    window.history.replaceState(null, '', '/templates/?q=launch');

    window.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: Cannot save "Q3 launch plan"' }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError('Failed to fetch') }));

    expect(analytics.getEvents().slice(-2).map(({ properties }) => properties)).toEqual([
      objectContaining({ message: 'Uncaught TypeError: Cannot save "Q3 launch plan"', context: 'window_error', url: window.location.href }),
      objectContaining({ message: 'TypeError: Failed to fetch', context: 'unhandled_promise_rejection', url: window.location.href }),
    ]);
    expect(window.location.href).toContain('?q=launch');
    expect(sends()).toEqual([0, 0, 0]);
  });
});

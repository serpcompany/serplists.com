import { afterEach, describe, expect, it, vi } from 'vitest';

import { analytics } from '@/lib/analytics';

const MAX_EVENTS_KEPT = 100;

vi.hoisted(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('the in-memory analytics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps at most 100 events in the tab's memory and sends none of them anywhere", () => {
    const fetchSpy = vi.fn();
    const sendBeacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
    const xhrSend = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchSpy);

    for (let view = 0; view < 150; view += 1) analytics.trackTemplateView(`template-${view}`, 'Launch plan');

    const events = analytics.getEvents();
    expect(events).toHaveLength(MAX_EVENTS_KEPT);
    expect(events.at(-1)?.properties).toEqual({ templateId: 'template-149', templateTitle: 'Launch plan' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(xhrSend).not.toHaveBeenCalled();
  });
});

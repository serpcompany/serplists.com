import { describe, expect, it } from 'vitest';

import { createPageVisitTracker } from '@/lib/navigation/pageVisit';

describe('createPageVisitTracker, whose visit is current only while the page is shown at the location it began on', () => {
  const shownPage = () => {
    const tracker = createPageVisitTracker();
    tracker.enter();
    return tracker;
  };

  it('is current while the user stays on the page', () => {
    const tracker = shownPage();
    const visit = tracker.begin();

    expect(visit.isCurrent()).toBe(true);
  });

  it('is not current once the page unmounts (the user went elsewhere)', () => {
    const tracker = shownPage();
    const visit = tracker.begin();

    tracker.leave();

    expect(visit.isCurrent()).toBe(false);
  });

  it('is not current after the location changes on the same mounted page, which leaves and enters again', () => {
    const tracker = shownPage();
    const visit = tracker.begin();

    tracker.leave();
    tracker.enter();

    expect(visit.isCurrent()).toBe(false);
  });

  it('makes an action started at the new location of the same page current there', () => {
    const tracker = shownPage();
    tracker.begin();

    tracker.leave();
    tracker.enter();

    expect(tracker.begin().isCurrent()).toBe(true);
  });

  it('stays not current if the user comes back to the same page later', () => {
    const tracker = shownPage();
    const visit = tracker.begin();

    tracker.leave();
    tracker.enter();
    tracker.leave();
    tracker.enter();

    expect(visit.isCurrent()).toBe(false);
  });

  it('works after the StrictMode mount, unmount, mount sequence', () => {
    const tracker = createPageVisitTracker();
    tracker.enter();
    tracker.leave();
    tracker.enter();

    expect(tracker.begin().isCurrent()).toBe(true);
  });

  it('is never current before the page has been shown', () => {
    const tracker = createPageVisitTracker();
    const visit = tracker.begin();
    tracker.enter();

    expect(visit.isCurrent()).toBe(false);
  });
});

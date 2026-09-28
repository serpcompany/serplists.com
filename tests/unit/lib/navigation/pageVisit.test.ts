import { describe, expect, it } from 'vitest';

import { createPageVisitTracker } from '@/lib/navigation/pageVisit';

// React Router still runs a navigate() captured by a page the user already left, so a
// request that finishes late pulled them back to that page's destination. A visit
// started with an action is current only while the page is shown at the same location.
describe('createPageVisitTracker', () => {
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

  it('is not current after the location changes on the same page', () => {
    // /dashboard/runs/A to /dashboard/runs/B keeps the same page mounted: the effect
    // leaves and enters again for the new location.
    const tracker = shownPage();
    const visit = tracker.begin();

    tracker.leave();
    tracker.enter();

    expect(visit.isCurrent()).toBe(false);
    // An action started at the new location is current there.
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

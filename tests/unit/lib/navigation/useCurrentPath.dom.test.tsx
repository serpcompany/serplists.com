import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { navigation } from '../../../support/mockedNextNavigation';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { useCurrentPath } from '@/lib/navigation/useCurrentPath';

function CurrentPath() {
  return <p>{useCurrentPath()}</p>;
}

describe('the current path a page reads', () => {
  theInMemoryBrowserAsTheWindow();

  afterEach(cleanup);

  it('is the path with its query and hash, so a link back returns to the same view', async () => {
    navigation.reset('/templates/launch-day/?tab=runs#notes');

    await renderSettled(<CurrentPath />);

    expect(screen.getByText('/templates/launch-day/?tab=runs#notes')).toBeTruthy();
  });

  it('is the bare path on a page with no query', async () => {
    navigation.reset('/templates/launch-day/');

    await renderSettled(<CurrentPath />);

    expect(screen.getByText('/templates/launch-day/')).toBeTruthy();
  });
});

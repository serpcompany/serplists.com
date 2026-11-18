import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueryListState } from '@/components/shared/QueryListState';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

const renderTheList = (query: { data: readonly unknown[] | undefined; isError: boolean; isLoading: boolean }) =>
  renderSettled(
    <QueryListState
      empty={<p>No members yet.</p>}
      loadErrorLabel="Couldn't load members."
      loadingLabel="Loading members..."
      onRetry={vi.fn()}
      query={query}
      refreshErrorLabel="Couldn't refresh members."
    >
      <ul aria-label="Members" />
    </QueryListState>,
  );

describe('a list that loads from the API', () => {
  it('shows nothing while its request has not started', async () => {
    const { container } = await renderTheList({ data: undefined, isError: false, isLoading: false });

    expect(container.innerHTML).toBe('');
  });

  it('keeps the list it has and says a refresh failed', async () => {
    await renderTheList({ data: ['member-1'], isError: true, isLoading: false });

    expect(screen.getByText("Couldn't refresh members.")).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Members' })).toBeTruthy();
  });
});

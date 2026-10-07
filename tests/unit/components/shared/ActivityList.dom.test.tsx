import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityList, type ActivityEntry } from '@/components/shared/ActivityList';

afterEach(cleanup);

const entries = (count: number): ActivityEntry[] =>
  Array.from({ length: count }, (_, index) => ({ actor: 'Alice', key: `entry-${index}`, label: `Change ${index}`, time: 'Oct 3, 2026' }));

const renderList = (count: number, viewAll?: { showingAll: boolean; onViewAll: () => void }) =>
  render(
    <ActivityList
      emptyLabel="Nothing yet."
      entries={entries(count)}
      errorLabel="Unavailable."
      loadingLabel="Loading..."
      viewAll={viewAll}
    />,
  );

describe('Activity and its View all', () => {
  it('offers View all activity once the 8 entries the page shows are full, and asks for the rest', async () => {
    const onViewAll = vi.fn();
    renderList(8, { showingAll: false, onViewAll });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View all activity' }));
    });

    expect(onViewAll).toHaveBeenCalledOnce();
  });

  it('offers nothing more when fewer than 8 entries exist, or where the page offers no View all', () => {
    renderList(7, { showingAll: false, onViewAll: vi.fn() });
    expect(screen.queryByRole('button', { name: 'View all activity' })).toBeNull();
    cleanup();

    renderList(8);
    expect(screen.queryByRole('button', { name: 'View all activity' })).toBeNull();
  });

  it('says it shows the latest 100 when View all reaches the most the API sends, and nothing below that', () => {
    renderList(100, { showingAll: true, onViewAll: vi.fn() });
    expect(screen.getByText('Showing the latest 100 entries.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View all activity' })).toBeNull();
    cleanup();

    renderList(42, { showingAll: true, onViewAll: vi.fn() });
    expect(screen.queryByText('Showing the latest 100 entries.')).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(42);
  });
});

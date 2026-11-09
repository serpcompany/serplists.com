import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar-provider';
import { useSidebar } from '@/components/ui/use-sidebar';
import { renderSettled } from '../../../support/renderInTheDom';

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

function SidebarToggle() {
  const { toggleSidebar, state } = useSidebar();
  return <button onClick={toggleSidebar}>Sidebar {state}</button>;
}

describe('SidebarProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the sidebar_state cookie for the whole site for 7 days when the sidebar opens or closes, and no other cookie', async () => {
    const written: string[] = [];
    vi.spyOn(document, 'cookie', 'set').mockImplementation((cookie: string) => {
      written.push(cookie);
    });
    await renderSettled(
      <SidebarProvider>
        <SidebarToggle />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sidebar expanded' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sidebar collapsed' }));

    expect(written).toEqual([
      `sidebar_state=false; path=/; max-age=${SEVEN_DAYS_IN_SECONDS}`,
      `sidebar_state=true; path=/; max-age=${SEVEN_DAYS_IN_SECONDS}`,
    ]);
  });

  it('opens and closes the sidebar with Ctrl+B or Cmd+B, and ignores B alone', async () => {
    await renderSettled(
      <SidebarProvider>
        <SidebarToggle />
      </SidebarProvider>,
    );

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Sidebar collapsed' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: 'Sidebar collapsed' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.getByRole('button', { name: 'Sidebar expanded' })).toBeTruthy();
  });

  it('leaves an open state the page controls to the page, telling it what the toggle asks for', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const { rerender } = await renderSettled(
      <SidebarProvider onOpenChange={onOpenChange} open={false}>
        <SidebarToggle />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sidebar collapsed' }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Sidebar collapsed' })).toBeTruthy();

    rerender(
      <SidebarProvider onOpenChange={onOpenChange} open>
        <SidebarToggle />
      </SidebarProvider>,
    );
    expect(screen.getByRole('button', { name: 'Sidebar expanded' })).toBeTruthy();
  });
});

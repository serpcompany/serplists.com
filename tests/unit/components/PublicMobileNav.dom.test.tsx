import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import React, { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublicMobileNav } from '@/components/layout/PublicMobileNav';

import { onTheInMemoryBrowser, renderSettled } from '../../support/renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: null }) }));

describe('the public menu sheet on phones', () => {
  it('closes once the visitor picks a link in it', async () => {
    navigation.reset('/');
    await onTheInMemoryBrowser(async () => {
      await renderSettled(<PublicMobileNav />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      });
      const sheet = await screen.findByRole('dialog');
      await act(async () => {
        fireEvent.click(within(sheet).getByRole('link', { name: 'Pricing' }));
        await navigation.settle();
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(navigation.pathname()).toBe('/pricing/');
    });
  });
});

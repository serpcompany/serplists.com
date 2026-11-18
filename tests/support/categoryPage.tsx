import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import CategoryDetail from '@/views/CategoryDetail';

import type { ResetOptions } from './inMemoryBrowser';
import { navigation } from './nextNavigation';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

export const renderTheCategoryPageAt = (location: string, opened: ResetOptions = { routes: ['/categories/[categorySlug]'] }) => {
  navigation.reset(location, opened);
  return renderToStaticMarkup(<CategoryDetail />);
};

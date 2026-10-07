import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

import CategoryDetail from '@/views/CategoryDetail';

import { navigation } from './nextNavigation';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

export const renderTheCategoryPageAt = (location: string) => {
  navigation.reset(location, { routes: ['/categories/[categorySlug]'] });
  return renderToStaticMarkup(<CategoryDetail />);
};

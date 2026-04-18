import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import DashboardSettings from '@/pages/DashboardSettings';

const refreshProfile = vi.fn();
const updateUser = vi.fn();

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'john@example.com',
      id: 'user-1',
      image: 'https://example.com/avatar.png',
      name: 'John Doe',
      username: 'johndoe',
    },
    refreshProfile,
  }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        user: {
          email: 'john@example.com',
          image: 'https://example.com/avatar.png',
          name: 'John Doe',
          username: 'johndoe',
        },
      },
    }),
    updateUser: (...args: unknown[]) => updateUser(...args),
  },
}));

describe('DashboardSettings page', () => {
  it('renders the dashboard settings tabs and section cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard/settings']}>
        <DashboardSettings />
      </MemoryRouter>,
    );

    expect(html).toContain('Settings');
    expect(html).toContain('Profile');
    expect(html).toContain('Notifications');
    expect(html).toContain('Privacy');
    expect(html).toContain('Data');
    expect(html).toContain('Profile Information');
    expect(html).toContain('Email Notifications');
    expect(html).toContain('Privacy Settings');
    expect(html).toContain('Export Data');
    expect(html).toContain('Danger Zone');
    expect(html).toContain('john@example.com');
    expect(html).toContain('John Doe');
  });
});

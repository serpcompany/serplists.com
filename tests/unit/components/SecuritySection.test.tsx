import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SecuritySection } from '@/components/account/SecuritySection';

vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: vi.fn(), revokeOtherSessions: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const renderSignOutOtherSessionsSwitch = () => {
  const html = renderToStaticMarkup(<SecuritySection />);
  const switches = html.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
  expect(switches).toHaveLength(1);
  return { html, switchTag: switches[0] };
};

describe('SecuritySection', () => {
  it('names the sign-out-other-sessions switch with its visible label and describes it, so assistive tech announces what it does, not just "switch, on"', () => {
    const { html, switchTag } = renderSignOutOtherSessionsSwitch();

    const id = switchTag.match(/\sid="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(
      new RegExp(`<label[^>]*for="${escapeRegExp(id!)}"[^>]*>Sign out other sessions</label>`),
    );

    const describedBy = switchTag.match(/\saria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(
      new RegExp(`<p[^>]*id="${escapeRegExp(describedBy!)}"[^>]*>Keeps you signed in on this device.</p>`),
    );
  });

  it('gives the switch no aria-label, which would override its visible label as its name', () => {
    expect(renderSignOutOtherSessionsSwitch().switchTag).not.toContain('aria-label=');
  });
});

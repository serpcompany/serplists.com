import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SecuritySection } from '@/components/account/SecuritySection';

// The switch decides whether changing the password signs out other devices,
// so assistive tech must announce what it does, not just "switch, on".

vi.mock('@/lib/auth-client', () => ({
  authClient: { changePassword: vi.fn(), revokeOtherSessions: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('SecuritySection', () => {
  it('names the sign-out-other-sessions switch with its visible label and describes it', () => {
    const html = renderToStaticMarkup(<SecuritySection />);

    const switches = html.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
    expect(switches).toHaveLength(1);
    const switchTag = switches[0];

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

    // The visible label is the name; an aria-label would override it.
    expect(switchTag).not.toContain('aria-label=');
  });
});

import type { Page, Request, Route } from '@playwright/test';

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

export type ApiCall = { route: Route; request: Request; url: URL; path: string; method: string };

export async function routeTheApi(page: Page, answer: (call: ApiCall) => Promise<void>) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    await answer({ route, request, url, path: url.pathname, method: request.method() });
  });
}

type SessionUser = { id: string; email: string; name: string; username: string };

export const sessionOf = (user: SessionUser) => ({
  session: {
    id: 'session-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-07-08T00:00:00.000Z',
    token: 'session-token',
    updatedAt: '2026-07-01T00:00:00.000Z',
    userId: user.id,
  },
  user: { id: user.id, email: user.email, emailVerified: true, name: user.name, username: user.username },
});

export const OWNER_SESSION = sessionOf({ id: 'user-owner', email: 'owner@example.com', name: 'Owner User', username: 'owner' });

export const ACME_ORG_OWNED = [
  { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme Org', role: 'owner', slug: 'acme' },
];

export const FREE_BILLING_STATUS = { billingEnabled: true, plan: 'free' };

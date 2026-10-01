import { expect, test } from '@playwright/test';

import { API_BASE_URL as apiBaseUrl } from './support/stack';

const attackerOrigin = 'http://attacker.test';

test('a cross-site form cannot sign the visitor into another account', async ({ page }) => {
  const signIn = await page.request.post(`${apiBaseUrl}/auth/sign-in/email`, {
    data: { email: 'john@test.com', password: 'password123' },
  });
  expect(signIn.status()).toBe(200);

  await page.route(`${attackerOrigin}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
        <form method="POST" action="${apiBaseUrl}/auth/sign-in/email">
          <input name="email" value="admin@test.com">
          <input name="password" value="password123">
        </form>
        <script>document.forms[0].submit()</script>`,
    }),
  );

  const formPost = page.waitForResponse(`${apiBaseUrl}/auth/sign-in/email`);
  await page.goto(`${attackerOrigin}/`);
  expect((await formPost).status()).toBe(415);

  const session = await page.request.get(`${apiBaseUrl}/auth/get-session`);
  expect(session.status()).toBe(200);
  const body = (await session.json()) as { user?: { email?: string } } | null;
  expect(body?.user?.email).toBe('john@test.com');
});

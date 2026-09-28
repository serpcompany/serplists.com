import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Aa!team-flow-password-12345';

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerAccount(page: Page, account: { email: string; name: string }) {
  await page.goto('/register');
  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#confirmPassword').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({
    timeout: 30_000,
  });
}

async function createLinkInvite(page: Page, email: string): Promise<string> {
  await page.getByLabel('Invite email').fill(email);
  await page.getByRole('button', { name: /create link/i }).click();

  const inviteLink = page.getByRole('textbox', { name: 'Invite link' });
  await expect(inviteLink).toHaveValue(/\/team-invites\/.+/, {
    timeout: 15_000,
  });

  return inviteLink.inputValue();
}

async function gotoInvite(page: Page, inviteUrl: string) {
  const url = new URL(inviteUrl);
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
}

function captureTeamApiResponses(page: Page) {
  const responses: string[] = [];

  page.on('response', async (response) => {
    if (!response.url().includes('/api/teams')) {
      return;
    }

    const body = await response.text().catch(() => '<unreadable body>');
    responses.push(`${response.status()} ${response.request().method()} ${response.url()} ${body}`);
  });

  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/teams')) {
      return;
    }

    responses.push(
      `FAILED ${request.method()} ${request.url()} ${request.failure()?.errorText ?? '<unknown>'}`,
    );
  });

  return responses;
}

async function expectInviteAccepted(page: Page, responses: string[]) {
  try {
    await expect(page.getByText('Invite accepted.')).toBeVisible({
      timeout: 30_000,
    });
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '<unreadable page>');
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `Current URL: ${page.url()}`,
        `Team API responses: ${responses.length ? responses.join('\n') : '<none>'}`,
        `Visible page text:\n${bodyText}`,
      ].join('\n\n'),
    );
  }
}

async function expectWorkspaceSelected(
  page: Page,
  teamName: string,
  responses: string[],
) {
  try {
    await expect(page.getByRole('button', { name: 'Switch context' })).toContainText(
      teamName,
      { timeout: 15_000 },
    );
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '<unreadable page>');
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `Current URL: ${page.url()}`,
        `Team API responses: ${responses.length ? responses.join('\n') : '<none>'}`,
        `Visible page text:\n${bodyText}`,
      ].join('\n\n'),
    );
  }
}

test('@smoke team invite flow asks before joining through a link, lets members leave, and works from account settings', async ({ browser, page }) => {
  test.setTimeout(120_000);

  const suffix = uniqueSuffix();
  const teamName = `Flow Team ${suffix}`;
  const ownerEmail = `owner+${suffix}@e2e.local`;
  const linkInviteeEmail = `link+${suffix}@e2e.local`;
  const settingsInviteeEmail = `settings+${suffix}@e2e.local`;

  await registerAccount(page, {
    email: ownerEmail,
    name: 'Owner User',
  });

  await page.goto('/dashboard/settings');
  await page.locator('#team-name').fill(teamName);
  await page.locator('#team-slug').fill(`flow-${suffix.toLowerCase()}`);
  await page.getByRole('button', { name: 'Create Organization' }).click();

  await expect(page.getByRole('button', { name: 'Switch context' })).toContainText(
    teamName,
    { timeout: 15_000 },
  );
  await expect(page.getByText('Your role: Owner')).toBeVisible();
  await expect(page.getByText(teamName).first()).toBeVisible();

  const linkInviteUrl = await createLinkInvite(page, linkInviteeEmail);
  await expect(page.getByText(linkInviteeEmail)).toBeVisible();

  await createLinkInvite(page, settingsInviteeEmail);
  await expect(page.getByText(settingsInviteeEmail)).toBeVisible();

  const linkInviteeContext = await browser.newContext();
  const linkInviteePage = await linkInviteeContext.newPage();
  const linkInviteResponses = captureTeamApiResponses(linkInviteePage);
  await registerAccount(linkInviteePage, {
    email: linkInviteeEmail,
    name: 'Link Invitee',
  });
  const acceptRequests: string[] = [];
  linkInviteePage.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/teams\/invites\/[^/]+\/accept$/.test(request.url())) {
      acceptRequests.push(request.url());
    }
  });
  await gotoInvite(linkInviteePage, linkInviteUrl);

  // Opening the link only previews the invite: no accept request, no context switch.
  await expect(linkInviteePage.getByText(teamName, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(linkInviteePage.getByText('Owner User invited you to join as Viewer.')).toBeVisible();
  const acceptButton = linkInviteePage.getByRole('button', { name: 'Accept invite' });
  await expect(acceptButton).toBeVisible();
  expect(acceptRequests).toEqual([]);

  await acceptButton.dblclick();
  await expectInviteAccepted(linkInviteePage, linkInviteResponses);
  expect(acceptRequests).toHaveLength(1);
  const storedWorkspaceAfterAccept = await linkInviteePage.evaluate(() =>
    window.localStorage.getItem('serplists.activeWorkspaceId'),
  );
  expect(storedWorkspaceAfterAccept ?? 'personal').toBe('personal');

  await linkInviteePage.getByRole('button', { name: `Switch to ${teamName}` }).click();
  await linkInviteePage.goto('/dashboard/settings');
  await expectWorkspaceSelected(linkInviteePage, teamName, linkInviteResponses);
  await expect(linkInviteePage.getByText('Your role: Viewer')).toBeVisible();

  // Members can leave on their own; the context returns to Personal.
  linkInviteePage.once('dialog', (dialog) => void dialog.accept());
  await linkInviteePage.getByRole('button', { name: 'Leave Organization' }).click();
  await expect(linkInviteePage.getByRole('button', { name: 'Switch context' })).toContainText(
    'Personal',
    { timeout: 15_000 },
  );
  await expect(linkInviteePage.getByRole('button', { name: 'Leave Organization' })).toHaveCount(0);
  await linkInviteeContext.close();

  const settingsInviteeContext = await browser.newContext();
  const settingsInviteePage = await settingsInviteeContext.newPage();
  await registerAccount(settingsInviteePage, {
    email: settingsInviteeEmail,
    name: 'Settings Invitee',
  });
  await settingsInviteePage.goto('/dashboard/settings');
  await expect(settingsInviteePage.getByText('Incoming invites')).toBeVisible({
    timeout: 15_000,
  });
  await expect(settingsInviteePage.getByText(teamName).first()).toBeVisible();
  await settingsInviteePage
    .getByRole('button', { name: `Accept invite to ${teamName}` })
    .click();
  await expect(settingsInviteePage.getByRole('button', { name: 'Switch context' })).toContainText(
    teamName,
    { timeout: 15_000 },
  );
  await expect(settingsInviteePage.getByText('Your role: Viewer')).toBeVisible();
  await expect(settingsInviteePage.getByText('Incoming invites')).toHaveCount(0);
  await settingsInviteeContext.close();

  await page.goto('/dashboard/settings');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch context' })).toContainText(
    teamName,
    { timeout: 15_000 },
  );
  await expect(page.getByText(settingsInviteeEmail)).toBeVisible({
    timeout: 15_000,
  });
  // The link invitee left, so only the activity history remembers them.
  await expect(page.getByText(linkInviteeEmail)).toHaveCount(0);
  await expect(page.getByText('Member left')).toBeVisible();
});

test('a new invitee who signs up from the invite link comes back to the invite', async ({ browser, page }) => {
  test.setTimeout(120_000);

  const suffix = uniqueSuffix();
  const teamName = `Signup Team ${suffix}`;
  const inviteeEmail = `signup+${suffix}@e2e.local`;

  await registerAccount(page, { email: `owner+${suffix}@e2e.local`, name: 'Owner User' });
  await page.goto('/dashboard/settings');
  await page.locator('#team-name').fill(teamName);
  await page.getByRole('button', { name: 'Create Organization' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toContainText(teamName, {
    timeout: 15_000,
  });
  const inviteUrl = await createLinkInvite(page, inviteeEmail);
  const invitePath = new URL(inviteUrl).pathname;

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await gotoInvite(inviteePage, inviteUrl);

  // Through Log in, then Sign up: the invite path must survive both hops.
  await inviteePage.getByRole('link', { name: 'Log in to accept' }).click();
  await inviteePage.getByRole('link', { name: 'Sign up' }).click();
  await expect(inviteePage).toHaveURL(/\/register\?next=/);

  await inviteePage.getByLabel('Name').fill('New Invitee');
  await inviteePage.getByLabel('Email').fill(inviteeEmail);
  await inviteePage.locator('#password').fill(PASSWORD);
  await inviteePage.locator('#confirmPassword').fill(PASSWORD);
  await inviteePage.getByRole('button', { name: 'Create account' }).click();

  // Local development skips email verification, so sign-up lands on the invite.
  await expect(inviteePage).toHaveURL(new RegExp(`${invitePath}$`), { timeout: 30_000 });
  await inviteePage.getByRole('button', { name: 'Accept invite' }).click();
  await expect(inviteePage.getByText('Invite accepted.')).toBeVisible({ timeout: 30_000 });
  await inviteeContext.close();
});

test('a manager who lost an invite link can replace it, and the old link stops working', async ({ browser, page }) => {
  test.setTimeout(120_000);

  const suffix = uniqueSuffix();
  const teamName = `Relink Team ${suffix}`;
  const inviteeEmail = `relink+${suffix}@e2e.local`;

  await registerAccount(page, { email: `owner+${suffix}@e2e.local`, name: 'Owner User' });
  await page.goto('/dashboard/settings');
  await page.locator('#team-name').fill(teamName);
  await page.getByRole('button', { name: 'Create Organization' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toContainText(teamName, {
    timeout: 15_000,
  });
  const lostInviteUrl = await createLinkInvite(page, inviteeEmail);

  // The link is gone after a reload; inviting the same email again offers a new link.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0);
  await page.getByLabel('Invite email').fill(inviteeEmail);
  await page.getByRole('button', { name: /create link/i }).click();
  await expect(page.getByText(`An invite is already pending for ${inviteeEmail}`)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Create new link' }).click();
  const inviteLink = page.getByRole('textbox', { name: 'Invite link' });
  await expect(inviteLink).toHaveValue(/\/team-invites\/.+/, { timeout: 15_000 });
  const replacedUrl = await inviteLink.inputValue();
  expect(replacedUrl).not.toBe(lostInviteUrl);

  // The pending row offers the same action after another reload.
  await page.reload();
  await page.getByRole('button', { name: `New link for ${inviteeEmail}` }).click();
  await expect(inviteLink).toHaveValue(/\/team-invites\/.+/, { timeout: 15_000 });
  const newInviteUrl = await inviteLink.inputValue();
  expect(newInviteUrl).not.toBe(replacedUrl);

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await registerAccount(inviteePage, { email: inviteeEmail, name: 'Relink Invitee' });

  await gotoInvite(inviteePage, lostInviteUrl);
  await expect(inviteePage.getByText('This invite is no longer available.', { exact: false })).toBeVisible({
    timeout: 30_000,
  });
  await gotoInvite(inviteePage, replacedUrl);
  await expect(inviteePage.getByText('This invite is no longer available.', { exact: false })).toBeVisible({
    timeout: 30_000,
  });

  await gotoInvite(inviteePage, newInviteUrl);
  await inviteePage.getByRole('button', { name: 'Accept invite' }).click();
  await expect(inviteePage.getByText('Invite accepted.')).toBeVisible({ timeout: 30_000 });
  await inviteeContext.close();
});

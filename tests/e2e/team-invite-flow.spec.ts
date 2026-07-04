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
  await expect(page.getByRole('button', { name: 'Switch workspace' })).toBeVisible({
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
    await expect(page.getByRole('button', { name: 'Switch workspace' })).toContainText(
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

test('@smoke team invite flow works through link and account settings', async ({ browser, page }) => {
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
  await page.getByRole('button', { name: 'Create team' }).click();

  await expect(page.getByRole('button', { name: 'Switch workspace' })).toContainText(
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
  await gotoInvite(linkInviteePage, linkInviteUrl);
  await expectInviteAccepted(linkInviteePage, linkInviteResponses);
  const storedWorkspaceAfterAccept = await linkInviteePage.evaluate(() =>
    window.localStorage.getItem('serplists.activeWorkspaceId'),
  );
  linkInviteResponses.push(`STORED_AFTER_ACCEPT ${storedWorkspaceAfterAccept ?? '<null>'}`);
  await linkInviteePage.goto('/dashboard/settings');
  await expectWorkspaceSelected(linkInviteePage, teamName, linkInviteResponses);
  await expect(linkInviteePage.getByText('Your role: Viewer')).toBeVisible();
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
  await expect(settingsInviteePage.getByRole('button', { name: 'Switch workspace' })).toContainText(
    teamName,
    { timeout: 15_000 },
  );
  await expect(settingsInviteePage.getByText('Your role: Viewer')).toBeVisible();
  await expect(settingsInviteePage.getByText('Incoming invites')).toHaveCount(0);
  await settingsInviteeContext.close();

  await page.goto('/dashboard/settings');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch workspace' })).toContainText(
    teamName,
    { timeout: 15_000 },
  );
  await expect(page.getByText(linkInviteeEmail)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(settingsInviteeEmail)).toBeVisible();
});

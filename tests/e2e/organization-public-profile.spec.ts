import { expect, test, type Browser, type Page } from '@playwright/test';

import { apiJsonAt as callApi, apiRecord } from './support/api-requests';
import { createdOrganization, savedTemplateSchema, updatedTeamSchema } from './support/api-bodies';
import { expectNoSidewaysScroll } from './support/phone';
import { loginAsAdmin } from './support/sign-in';

const DESCRIPTION = 'Launch checklists our agency publishes for every client.';

async function publishAnOrganizationTemplate(page: Page) {
  const stamp = Date.now();
  const handle = `Org-Profile-${stamp}`;
  const name = `Profile Org ${stamp}`;
  const title = `Org public template ${stamp}`;
  const organization = await callApi(page, '/teams', 'POST', createdOrganization, { name, slug: handle });
  await callApi(page, `/teams/${organization.id}`, 'PUT', updatedTeamSchema, { description: DESCRIPTION });
  const template = await callApi(page, '/templates', 'POST', savedTemplateSchema, {
    title,
    is_public: true,
    teamId: organization.id,
    sections: [{ id: `org-profile-section-${stamp}`, title: 'Section', items: [{ id: `org-profile-item-${stamp}`, title: 'Task' }] }],
  });
  return { handle, name, title, templateId: template.id, slug: String(template.slug) };
}

async function asAGuest<T>(browser: Browser, visit: (guest: Page) => Promise<T>): Promise<T> {
  const guestContext = await browser.newContext();
  try {
    return await visit(await guestContext.newPage());
  } finally {
    await guestContext.close();
  }
}

test("an Organization's Public Profile shows its name, handle and description, and opens its public Template under its handle", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const published = await publishAnOrganizationTemplate(page);

  try {
    await asAGuest(browser, async (guest) => {
      await guest.goto(`/profile/${published.handle.toLowerCase()}/`);

      await expect(guest).toHaveURL(new RegExp(`/profile/${published.handle}/$`), { timeout: 30_000 });
      await expect(guest.getByRole('heading', { level: 1, name: published.name })).toBeVisible();
      await expect(guest.getByText(`@${published.handle}`).first()).toBeVisible();
      await expect(guest.getByText(DESCRIPTION)).toBeVisible();

      await guest.getByRole('link', { name: published.title }).click();
      await expect(guest).toHaveURL(new RegExp(`/profile/${published.handle}/${published.slug}/$`));
      await expect(guest.getByRole('heading', { level: 1, name: published.title })).toBeVisible();
    });
  } finally {
    await apiRecord(page, 'DELETE', `/templates/${published.templateId}`);
  }
});

test("an Organization's public Template no longer opens under its Creator's username", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const published = await publishAnOrganizationTemplate(page);

  try {
    await asAGuest(browser, async (guest) => {
      await guest.goto(`/profile/admin/${published.slug}/`);

      await expect(guest.getByRole('heading', { name: 'Template not found' })).toBeVisible({ timeout: 30_000 });
    });
  } finally {
    await apiRecord(page, 'DELETE', `/templates/${published.templateId}`);
  }
});

test("an Organization's Public Profile fits a phone", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const published = await publishAnOrganizationTemplate(page);

  try {
    await asAGuest(browser, async (guest) => {
      await guest.setViewportSize({ width: 390, height: 844 });
      await guest.goto(`/profile/${published.handle}/`);

      await expect(guest.getByRole('heading', { level: 1, name: published.name })).toBeVisible({ timeout: 30_000 });
      await expect(guest.getByRole('link', { name: published.title })).toBeVisible();
      await expectNoSidewaysScroll(guest);
    });
  } finally {
    await apiRecord(page, 'DELETE', `/templates/${published.templateId}`);
  }
});

import { expect, test, type Browser, type Page } from '@playwright/test';

import { API_BASE_URL, apiJsonAt as callApi, apiRecord } from './support/api-requests';
import { createdOrganization, savedTemplateSchema, updatedTeamSchema } from './support/api-bodies';
import { expectNoSidewaysScroll } from './support/phone';
import { loginAsAdmin } from './support/sign-in';

const DESCRIPTION = 'Launch checklists our agency publishes for every client.';

type Published = { organizationId: string; handle: string; name: string; title: string; templateId: string; slug: string };

async function publishAnOrganizationTemplate(page: Page): Promise<Published> {
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
  return { organizationId: organization.id, handle, name, title, templateId: template.id, slug: String(template.slug) };
}

async function withAnOrganizationTemplate(page: Page, run: (published: Published) => Promise<void>) {
  await loginAsAdmin(page);
  const published = await publishAnOrganizationTemplate(page);
  try {
    await run(published);
  } finally {
    await apiRecord(page, 'DELETE', `/templates/${published.templateId}`);
  }
}

async function asAGuest(browser: Browser, visit: (guest: Page) => Promise<void>) {
  const guestContext = await browser.newContext();
  try {
    await visit(await guestContext.newPage());
  } finally {
    await guestContext.close();
  }
}

const organizationTemplateUrl = ({ handle, slug }: Published) => new RegExp(`/profile/${handle}/${slug}/`);

test("an Organization's Public Profile shows its name, handle and description, and opens its public Template under its handle", async ({ page, browser }) => {
  await withAnOrganizationTemplate(page, (published) =>
    asAGuest(browser, async (guest) => {
      await guest.goto(`/profile/${published.handle.toLowerCase()}/`);

      await expect(guest).toHaveURL(new RegExp(`/profile/${published.handle}/$`), { timeout: 30_000 });
      await expect(guest.getByRole('heading', { level: 1, name: published.name })).toBeVisible();
      await expect(guest.getByText(`@${published.handle}`).first()).toBeVisible();
      await expect(guest.getByText(DESCRIPTION)).toBeVisible();

      await guest.getByRole('link', { name: published.title }).click();
      await expect(guest).toHaveURL(organizationTemplateUrl(published));
      await expect(guest.getByRole('heading', { level: 1, name: published.title })).toBeVisible();

      await guest.getByRole('link', { name: published.name }).click();
      await expect(guest).toHaveURL(new RegExp(`/profile/${published.handle}/$`));
    }),
  );
});

test("the Creator URL an Organization Template had answers one permanent redirect to its Organization's URL, keeping the query", async ({ page, browser }) => {
  await withAnOrganizationTemplate(page, (published) =>
    asAGuest(browser, async (guest) => {
      const creatorUrl = `/profile/admin/${published.slug}/?ref=old-link`;

      const response = await guest.request.get(creatorUrl, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const location = new URL(response.headers()['location'] ?? '', API_BASE_URL);
      expect(`${location.pathname}${location.search}`).toBe(`/profile/${published.handle}/${published.slug}/?ref=old-link`);

      await guest.goto(creatorUrl);
      await expect(guest).toHaveURL(organizationTemplateUrl(published), { timeout: 30_000 });
      await expect(guest.getByRole('heading', { level: 1, name: published.title })).toBeVisible();
    }),
  );
});

test("Share and View public template give an Organization Template its Organization's URL", async ({ page }) => {
  await withAnOrganizationTemplate(page, async (published) => {
    await page.goto(`/dashboard/organization/${published.organizationId}/templates/${published.templateId}/`);
    await expect(page.getByRole('link', { name: 'View public template' })).toHaveAttribute(
      'href',
      `/profile/${published.handle}/${published.slug}/`,
      { timeout: 30_000 },
    );

    await page.getByRole('button', { name: 'Share' }).click();
    const link = page.getByRole('dialog', { name: 'Share Template' }).getByRole('textbox', { name: 'Share link' });
    await expect(link).toHaveValue(new RegExp(`/profile/${published.handle}/${published.slug}/$`));
  });
});

test("an Organization's Public Profile fits a phone", async ({ page, browser }) => {
  await withAnOrganizationTemplate(page, (published) =>
    asAGuest(browser, async (guest) => {
      await guest.setViewportSize({ width: 390, height: 844 });
      await guest.goto(`/profile/${published.handle}/`);

      await expect(guest.getByRole('heading', { level: 1, name: published.name })).toBeVisible({ timeout: 30_000 });
      await expect(guest.getByRole('link', { name: published.title })).toBeVisible();
      await expectNoSidewaysScroll(guest);
    }),
  );
});

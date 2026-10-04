import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { ACME_ORG_OWNED, answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { organizationTemplate } from './support/organization-records';
import { expectNoSidewaysScroll } from './support/phone';

const personalTemplate = {
  ...organizationTemplate,
  id: 'tpl-personal',
  title: 'Launch Playbook',
  owner_type: 'user',
  team_id: null,
  version: 3,
};

const ORGANIZATIONS = [
  ...ACME_ORG_OWNED,
  { id: 'team-2', memberId: 'member-2', membershipStatus: 'active', name: 'Beta Org', role: 'editor', slug: 'beta' },
  { id: 'team-3', memberId: 'member-3', membershipStatus: 'active', name: 'Viewer Org', role: 'viewer', slug: 'viewer-org' },
];

const transferBody = z.object({ teamId: z.string(), expected_version: z.number() });

async function mockATransferablePersonalTemplate(page: Page, template = personalTemplate) {
  const transfers: z.infer<typeof transferBody>[] = [];
  let owner: string | null = null;
  await routeTheApi(page, async (call) => {
    const { method, path, request, route } = call;
    if (path === '/api/teams' && method === 'GET') {
      await fulfillJson(route, ORGANIZATIONS);
    } else if (await answerTheAcmeOwnerSession(call)) {
      return;
    } else if (path === `/api/templates/${template.id}/transfer` && method === 'POST') {
      const body = transferBody.parse(request.postDataJSON());
      transfers.push(body);
      owner = body.teamId;
      await fulfillJson(route, { success: true, id: template.id, teamId: body.teamId, version: template.version + 1 });
    } else if (path === `/api/templates/${template.id}`) {
      await fulfillJson(route, owner ? { ...template, owner_type: 'team', team_id: owner, version: template.version + 1 } : template);
    } else {
      await fulfillJson(route, []);
    }
  });
  return transfers;
}

const openTheTransferDialog = async (page: Page) => {
  await page.getByRole('button', { name: 'Template actions' }).click({ timeout: 30_000 });
  await page.getByRole('menuitem', { name: 'Transfer to Organization' }).click();
  return page.getByRole('dialog', { name: 'Transfer to Organization' });
};

test('Transfer to Organization moves a private Personal Template into the chosen Organization and opens it there', async ({ page }) => {
  const transfers = await mockATransferablePersonalTemplate(page);
  await page.goto(`/dashboard/templates/${personalTemplate.id}/`);

  const dialog = await openTheTransferDialog(page);
  await expect(dialog.getByText('Runs you already started from it stay in Personal and no longer receive its changes.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Organization' }).click();
  await expect(page.getByRole('option')).toHaveText(['Acme Org', 'Beta Org']);
  await page.getByRole('option', { name: 'Beta Org' }).click();
  await dialog.getByRole('button', { name: 'Transfer' }).click();

  await expect(page).toHaveURL(`/dashboard/organization/team-2/templates/${personalTemplate.id}/`);
  await expect(page.getByText('Template transferred to Beta Org')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: personalTemplate.title })).toBeVisible();
  expect(transfers).toEqual([{ teamId: 'team-2', expected_version: 3 }]);
});

test('a public Personal Template asks to be made private before it can be transferred', async ({ page }) => {
  const transfers = await mockATransferablePersonalTemplate(page, { ...personalTemplate, is_public: 1 });
  await page.goto(`/dashboard/templates/${personalTemplate.id}/`);

  const dialog = await openTheTransferDialog(page);

  await expect(dialog.getByText(`Make "${personalTemplate.title}" private first`)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Transfer' })).toHaveCount(0);
  expect(transfers).toEqual([]);
});

test('the transfer dialog fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockATransferablePersonalTemplate(page);
  await page.goto(`/dashboard/templates/${personalTemplate.id}/`);

  const dialog = await openTheTransferDialog(page);

  await expect(dialog.getByRole('button', { name: 'Transfer' })).toBeInViewport();
  await expectNoSidewaysScroll(page);
});

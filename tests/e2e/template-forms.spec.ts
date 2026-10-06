import { expect, test, type Page } from '@playwright/test';

import { expectNoSidewaysScroll } from './support/phone';
import {
  deleteRun,
  openTheRunAt,
  postRun,
  readRun,
  runIdInTheUrl,
  startARunFromTheFirstStartRun,
} from './support/run-saves';
import { loginAsAdmin } from './support/sign-in';
import {
  addABlock,
  deleteTheSavedTemplate,
  getTemplateSections,
  saveAndFindTheSavedTemplate,
  startANewTemplateWithATask,
} from './support/template-editor';

const COMPLETE_REFUSED = "Finish this task's form first. Client name: Fill in this field.";

async function chooseFrom(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('combobox', { name: combobox })).toContainText(option);
}

async function buildTheIntakeForm(page: Page) {
  await page.getByLabel('Task Title').fill('Collect client details');
  await addABlock(page, 'Form');

  await page.getByLabel('Field 1 Label').fill('Client name');
  await page.getByRole('switch', { name: 'Field 1 Required' }).click();

  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field 2 Label').fill('Website');
  await chooseFrom(page, 'Field 2 Type', 'URL');

  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field 3 Label').fill('Plan');
  await chooseFrom(page, 'Field 3 Type', 'Dropdown');
  await page.getByRole('textbox', { name: 'Field 3 option 1' }).fill('Starter');
  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByRole('textbox', { name: 'Field 3 option 2' }).fill('Growth');
}

test("a Template's form is filled in on its run, and the task completes only once the form is answered", async ({ page }) => {
  const templateTitle = `Client intake ${Date.now()}`;
  await startANewTemplateWithATask(page, templateTitle);
  await buildTheIntakeForm(page);

  const savedTemplate = await saveAndFindTheSavedTemplate(page, templateTitle);
  expect(getTemplateSections(savedTemplate ?? {})[0]?.items[0]?.contents?.[0]).toMatchObject({
    type: 'form',
    fields: [
      expect.objectContaining({ label: 'Client name', kind: 'text', required: true }),
      expect.objectContaining({ label: 'Website', kind: 'url', required: false }),
      expect.objectContaining({
        label: 'Plan',
        kind: 'select',
        options: [expect.objectContaining({ label: 'Starter' }), expect.objectContaining({ label: 'Growth' })],
      }),
    ],
  });

  await page.goto(`/dashboard/templates/${savedTemplate?.id ?? ''}/`);
  await startARunFromTheFirstStartRun(page);
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
  const runId = runIdInTheUrl(page);
  await expect(page.getByRole('heading', { name: 'Collect client details' })).toBeVisible();

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByText(COMPLETE_REFUSED)).toBeVisible();
  await expect(page.getByText('Fill in this field.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Client name' })).toBeFocused();
  expect((await readRun(page, runId)).completed).toEqual([false]);

  await page.getByRole('textbox', { name: 'Client name' }).fill('Acme');
  await page.getByRole('textbox', { name: 'Website' }).fill('https://acme.example');
  await chooseFrom(page, 'Plan', 'Growth');
  await expect(page.getByText('Fill in this field.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect.poll(async () => (await readRun(page, runId)).completed).toEqual([true]);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Client name' })).toHaveValue('Acme');
  await expect(page.getByRole('textbox', { name: 'Website' })).toHaveValue('https://acme.example');
  await expect(page.getByRole('combobox', { name: 'Plan' })).toContainText('Growth');

  await deleteRun(page, runId);
  await deleteTheSavedTemplate(page, savedTemplate);
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the form editor and a run's form inputs fit the screen", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/templates/new/');
    await page.getByRole('button', { name: 'Outline', exact: true }).click();
    await page.getByRole('dialog', { name: 'Outline' }).getByRole('button', { name: 'Add task to Section 1' }).click();
    await addABlock(page, 'Form');
    await page.getByRole('button', { name: 'Add field' }).click();
    await chooseFrom(page, 'Field 2 Type', 'Multiple choice');
    await expect(page.getByRole('button', { name: 'Move field 2 up' })).toBeVisible();
    await expectNoSidewaysScroll(page);

    const runId = await postRun(page, {
      title: `Form phone QA ${Date.now()}`,
      sections: [{ id: 'form-phone', title: 'Section', items: [{
        id: 'form-phone-a',
        title: 'Task A',
        contents: [{
          id: 'form-phone-block',
          type: 'form',
          value: '',
          fields: [
            { id: 'field-phone-name', label: 'A client name long enough to wrap on a phone screen', kind: 'text', required: true },
            { id: 'field-phone-site', label: 'Website', kind: 'url', required: false, description: 'The address their customers visit' },
            { id: 'field-phone-plan', label: 'Plan', kind: 'select', required: false, options: [{ id: 'option-phone-1', label: 'Starter' }] },
            { id: 'field-phone-due', label: 'Due', kind: 'date', required: false },
          ],
        }],
      }] }],
    });
    await openTheRunAt(page, runId);

    await expect(page.getByRole('textbox', { name: 'Website' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Plan' })).toBeVisible();
    await expectNoSidewaysScroll(page);

    await deleteRun(page, runId);
  });
});

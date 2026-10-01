import { expect, test } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { openRunFromRunsList } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';
import { createRun, deleteRun, fetchRunWithSections } from './support/run-saves';

test('unsaved task notes are saved with Mark Complete and survive moving between tasks', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes draft QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42, see link');
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

  await notes.fill('Draft on B');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Deployed build 42, see link');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(notes).toHaveValue('Draft on B');

  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect(notes).toHaveValue('Draft on B');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Deployed build 42, see link');

  await deleteRun(page, runId);
});

test('text typed while a notes save is in flight is kept', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes in flight QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  let releaseSave: () => void = () => undefined;
  const saveHeld = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(`**/api/checklists/${runId}`, async (route) => {
    if (route.request().method() === 'PUT') await saveHeld;
    await route.continue();
  });

  await page.goto(`/dashboard/runs/${runId}/`);
  await notes.fill('abc');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await notes.pressSequentially('def');
  releaseSave();
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeEnabled();
  await expect(notes).toHaveValue('abcdef');

  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.unroute(`**/api/checklists/${runId}`);
  await page.reload();
  await expect(notes).toHaveValue('abcdef');

  await deleteRun(page, runId);
});

const NOTES_LEAVE_MESSAGE = 'You have unsaved task notes. Leave without saving?';

test('asks before unsaved task notes are lost through the app shell, Back or Sign out', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Notes leave guard QA ${Date.now()}`;
  const runId = await createRun(page, title);
  const runUrl = new RegExp(`/dashboard/runs/${runId}/$`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  const accountMenu = page.getByRole('button', { name: 'Account menu' });
  const sidebarTemplates = page.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Templates', exact: true });
  const dialogs: string[] = [];
  let acceptDialogs = false;
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await (acceptDialogs ? dialog.accept() : dialog.dismiss());
  });

  await openRunFromRunsList(page, title);
  await expect(page).toHaveURL(runUrl);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42');

  const expectStillOnRun = async (asked: number) => {
    await expect.poll(() => dialogs.length).toBe(asked);
    expect(dialogs.at(-1)).toBe(NOTES_LEAVE_MESSAGE);
    await expect(page).toHaveURL(runUrl);
    await expect(notes).toHaveValue('Deployed build 42');
  };

  await sidebarTemplates.click();
  await expectStillOnRun(1);

  await page.goBack();
  await expectStillOnRun(2);

  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'My Templates' }).click();
  await expectStillOnRun(3);

  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expectStillOnRun(4);
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();

  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expectStillOnRun(5);

  acceptDialogs = true;
  await sidebarTemplates.click();
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  expect(dialogs).toHaveLength(6);

  await deleteRun(page, runId);
});

test('completing a run saves an unsaved note and leaves without asking', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes complete QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('dialog', { name: 'Complete this Run?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await notes.fill('Signed off by QA');
  await page.getByRole('button', { name: 'Finish Run' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  expect(dialogs).toEqual([]);

  const { status, sections } = await fetchRunWithSections<{ notes?: string }>(page, runId);
  const stored = { status, notes: sections.flatMap((section) => section.items.map((item) => item.notes ?? '')) };
  expect(stored).toEqual({ status: 'completed', notes: ['', 'Signed off by QA'] });

  await deleteRun(page, runId);
});

test('a share-link guest is asked before unsaved task notes are lost', async ({ browser, page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Shared notes leave guard QA ${Date.now()}`);
  const { shareToken } = await apiJson<{ shareToken: string }>(page, `/checklists/run/${runId}/share`, {
    method: 'POST',
    body: {},
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const dialogs: string[] = [];
  let acceptDialogs = false;
  guest.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await (acceptDialogs ? dialog.accept() : dialog.dismiss());
  });
  const sharedUrl = new RegExp(`/share/${shareToken}/$`);
  const browse = guest.getByRole('link', { name: 'Browse the Template Library' });
  const notes = guest.getByRole('textbox', { name: 'Task notes' }).first();

  await guest.goto(`/share/${shareToken}/`);
  await notes.fill('Checked by the guest');
  await browse.click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toBe(NOTES_LEAVE_MESSAGE);
  await expect(guest).toHaveURL(sharedUrl);
  await expect(notes).toHaveValue('Checked by the guest');

  acceptDialogs = true;
  await browse.click();
  await expect(guest).toHaveURL(/\/templates\/$/);
  expect(dialogs).toHaveLength(2);

  await guestContext.close();
  await deleteRun(page, runId);
});

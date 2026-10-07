import type { Locator, Page } from '@playwright/test';

export const runListEntry = (page: Page, runId: string): Locator =>
  page
    .getByRole('row')
    .or(page.getByRole('listitem'))
    .filter({ has: page.locator(`a[href$="/runs/${runId}/"]`) });

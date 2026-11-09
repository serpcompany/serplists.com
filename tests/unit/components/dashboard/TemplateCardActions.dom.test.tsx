import { navigation } from '../../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/dashboard/TemplateCard';
import { TemplateListItem } from '@/components/dashboard/TemplateListItem';
import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import type { ChecklistTemplate } from '@/types/checklist';

import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';
import { openTheMenu, renderSettled } from '../../../support/renderInTheDom';

const recipe: ChecklistTemplate = {
  ...PRIVATE_LAUNCH_TEMPLATE,
  id: 'sourdough',
  title: 'Sourdough Loaf',
  type: 'recipe',
  isPublic: true,
  categories: ['Baking', 'Bread', 'Weekend', 'Family'],
};

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

beforeEach(() => {
  navigation.reset('/dashboard/templates/');
});

describe('a Template card in My Templates', () => {
  it('starts a run or deletes the Template from its menu', async () => {
    const onStartRun = vi.fn();
    const onDelete = vi.fn();
    await renderSettled(<TemplateCard context={PERSONAL_CONSOLE} onDelete={onDelete} onStartRun={onStartRun} template={recipe} />);

    const items = await openTheMenu('Actions for Sourdough Loaf');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Start Run', 'Delete']);
    await act(async () => {
      fireEvent.click(within(document.body).getByRole('menuitem', { name: 'Start Run' }));
    });
    await openTheMenu('Actions for Sourdough Loaf');
    await act(async () => {
      fireEvent.click(within(document.body).getByRole('menuitem', { name: 'Delete' }));
    });

    expect(onStartRun).toHaveBeenCalledWith('sourdough');
    expect(onDelete).toHaveBeenCalledWith('sourdough');
  });

  it('starts a run from the pointer shortcut on the card', async () => {
    const onStartRun = vi.fn();
    await renderSettled(<TemplateCard canEdit={false} context={PERSONAL_CONSOLE} onStartRun={onStartRun} template={recipe} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start Run', hidden: true }));
    });

    expect(onStartRun).toHaveBeenCalledWith('sourdough');
  });

  it('offers a runner only Start Run, and shows two categories and how many more there are', async () => {
    await renderSettled(<TemplateCard canEdit={false} context={PERSONAL_CONSOLE} onStartRun={vi.fn()} template={recipe} />);

    const card = screen.getByRole('article');
    expect(within(card).getAllByText(/^(Baking|Bread|Weekend|Family|\+2)$/).map((badge) => badge.textContent)).toEqual(['Baking', 'Bread', '+2']);
    expect(card.querySelector('svg.lucide-list')).toBeTruthy();
    expect((await openTheMenu('Actions for Sourdough Loaf')).map((item) => item.textContent)).toEqual(['Start Run']);
  });

  it('shows no menu and no category line to a viewer of a Template with no categories', async () => {
    const { categories, ...uncategorized } = recipe;
    await renderSettled(<TemplateCard canEdit={false} context={PERSONAL_CONSOLE} template={uncategorized} />);

    expect(screen.queryByRole('button', { name: 'Actions for Sourdough Loaf' })).toBeNull();
    expect(screen.queryByText('Baking')).toBeNull();
  });
});

describe('a Template row in the My Templates list', () => {
  it('shows a recipe with its description and starts a run from the row', async () => {
    const onStartRun = vi.fn();
    await renderSettled(
      <TemplateListItem canEdit={false} context={PERSONAL_CONSOLE} onStartRun={onStartRun} template={{ ...recipe, description: 'A weekend bake' }} />,
    );

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('A weekend bake')).toBeTruthy();
    expect(row.querySelector('svg.lucide-list')).toBeTruthy();
    await press('Start Run');

    expect(onStartRun).toHaveBeenCalledWith('sourdough');
  });

  it('shows a checklist with no description and no Start Run to someone who cannot run it', async () => {
    await renderSettled(<TemplateListItem context={PERSONAL_CONSOLE} template={{ ...PRIVATE_LAUNCH_TEMPLATE, description: '' }} />);

    const row = screen.getByRole('listitem');
    expect(row.querySelector('svg.lucide-file-text')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Start Run' })).toBeNull();
    expect(within(row).getByRole('link', { name: 'Edit' })).toBeTruthy();
  });
});

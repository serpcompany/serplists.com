import { navigation } from '../../support/mockedNextNavigation';
import {
  dashboardTemplates,
  showTheTemplatesModel,
  websiteLaunchTemplate as template,
} from '../../support/mockedDashboardTemplatesModel';
import React, { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Templates from '@/views/Templates';
import { firstOf } from '../../support/elements';
import { clickInTheDialog, openDialogs, theDialogsToClose } from '../../support/confirmDialogs';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();

const { description, categories, ...unlisted } = template();
const twoTasks = unlisted.sections;
const library = [
  { ...unlisted, id: 'vendor', title: 'Vendor onboarding', description: 'Contracts and access', isPublic: false, sections: [] },
  template({ id: 'launch', title: 'Website Launch Checklist', isPublic: true }),
  { ...unlisted, id: 'audit', title: 'Accessibility audit', categories: ['Compliance'], isPublic: false, sections: [...twoTasks, ...twoTasks] },
];

const removeTemplate = vi.fn(async () => undefined);

beforeEach(() => {
  dashboardTemplates.viewMode = 'list';
  removeTemplate.mockClear();
  showTheTemplatesModel({ templates: library, removeTemplate });
});

afterEach(() => cleanup());

const openMyTemplates = async () => {
  navigation.reset('/dashboard/templates/');
  await renderSettled(<Templates />);
};

const shownTitles = () =>
  library.map((item) => item.title).filter((title) => screen.queryByText(title) !== null);

const shownInOrder = () => {
  const text = document.body.textContent ?? '';
  return shownTitles().sort((left, right) => text.indexOf(left) - text.indexOf(right));
};

describe('My Templates search, visibility and sort', () => {
  it('searches titles, descriptions and categories', async () => {
    await openMyTemplates();

    await typeInto(inputNamed('Search'), 'contracts');
    expect(shownTitles()).toEqual(['Vendor onboarding']);

    await typeInto(inputNamed('Search'), 'compliance');
    expect(shownTitles()).toEqual(['Accessibility audit']);
  });

  it('says to adjust the filters, with no Create Template, when nothing matches', async () => {
    await openMyTemplates();

    await typeInto(inputNamed('Search'), 'no such template');

    expect(document.body.textContent).toContain('Try adjusting your search or filters');
    expect(screen.queryByRole('button', { name: 'Create Template' })).toBeNull();
  });

  it('shows only the public or only the private Templates', async () => {
    await openMyTemplates();

    await chooseTheOption('Visibility', 'Public');
    expect(shownTitles()).toEqual(['Website Launch Checklist']);

    await chooseTheOption('Visibility', 'Private');
    expect(shownTitles()).toEqual(['Vendor onboarding', 'Accessibility audit']);
  });

  it('sorts by title or by the number of tasks', async () => {
    await openMyTemplates();

    await chooseTheOption('Sort by', 'Alphabetical');
    expect(shownInOrder()).toEqual(['Accessibility audit', 'Vendor onboarding', 'Website Launch Checklist']);

    await chooseTheOption('Sort by', 'Most Tasks');
    expect(shownInOrder()).toEqual(['Accessibility audit', 'Website Launch Checklist', 'Vendor onboarding']);
  });
});

describe('My Templates delete dialog', () => {
  it('deletes nothing when Cancel closes it', async () => {
    await openMyTemplates();
    await act(async () => {
      fireEvent.click(firstOf(screen.getAllByRole('button', { name: 'Delete' })));
    });

    await clickInTheDialog(firstOf(openDialogs()), 'Cancel');

    await theDialogsToClose();
    expect(removeTemplate).not.toHaveBeenCalled();
  });
});

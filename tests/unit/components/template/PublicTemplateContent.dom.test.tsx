import { act } from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';
import type { ChecklistItem, ChecklistItemContent } from '@/types/checklist';

import { onlyElement, present } from '../../../support/elements';
import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

const oneSection = (items: ChecklistItem[]) => [{ id: 'section-1', title: 'Prepare', items }];

const press = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

const theSection = (title: string) =>
  present(screen.getByRole('heading', { name: title }).closest('section'), `the ${title} section`);

const theChevron = () => {
  const shown = screen.queryAllByRole('button');
  return onlyElement(screen.getAllByRole('button', { hidden: true }).filter((button) => !shown.includes(button)));
};

const expectNothingShownBesides = (section: HTMLElement, text: string) => {
  expect(section.textContent).toBe(text);
  expect(within(section).queryByRole('link')).toBeNull();
  expect(within(section).queryByRole('img')).toBeNull();
  expect(section.querySelector('video, iframe')).toBeNull();
};

const taskWith = (contents: ChecklistItemContent[]): ChecklistItem => ({
  id: 'task-1',
  title: 'Pack the van',
  description: '',
  contents,
});

describe('a task on the public Template page', () => {
  it('opens and closes its details from the title and from the chevron', async () => {
    await renderSettled(
      <PublicTemplateContent
        sections={oneSection([{ id: 'task-1', title: 'Pack the van', description: 'Heavy boxes first' }])}
      />,
    );
    const title = screen.getByRole('button', { name: 'Pack the van' });

    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Heavy boxes first')).toBeNull();

    await press(title);
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Heavy boxes first')).toBeTruthy();

    await press(theChevron());
    expect(screen.queryByText('Heavy boxes first')).toBeNull();
  });

  it('opens nothing for a task with no description and no blocks', async () => {
    await renderSettled(
      <PublicTemplateContent sections={oneSection([{ id: 'task-1', title: 'Lock up', description: '  ', contents: [] }])} />,
    );
    const title = screen.getByRole('button', { name: 'Lock up' });

    await press(title);

    expect(title.hasAttribute('aria-expanded')).toBe(false);
    expect(screen.getAllByRole('button', { hidden: true })).toEqual([title]);
    expectNothingShownBesides(theSection('Prepare'), 'Section 1Prepare1 taskLock up');
  });

  it('shows blocks with nothing in them as nothing', async () => {
    await renderSettled(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={oneSection([
          taskWith([
            { id: 'a', type: 'text', value: '' },
            { id: 'b', type: 'video', value: '' },
            { id: 'c', type: 'image', value: '' },
            { id: 'd', type: 'embed', value: '' },
            { id: 'e', type: 'file', value: '  ' },
            { id: 'f', type: 'subItems', value: '', subItems: [] },
            { id: 'g', type: 'form', value: '', fields: [] },
          ]),
        ])}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pack the van' }).getAttribute('aria-expanded')).toBe('true');
    expectNothingShownBesides(theSection('Prepare'), 'Section 1Prepare1 taskPack the van');
  });

  it('shows embed text that holds no web address as text, and lists sub-steps', async () => {
    await renderSettled(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={oneSection([
          taskWith([
            { id: 'a', type: 'embed', value: 'Ask the front desk for the code' },
            { id: 'b', type: 'subItems', value: '', subItems: [{ id: 's1', title: 'Tape' }, { title: '' }] },
          ]),
        ])}
      />,
    );

    expect(screen.getByText('Ask the front desk for the code').tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Sub-steps')).toBeTruthy();
    expect(screen.getByText('Tape')).toBeTruthy();
  });
});

describe('the sections of the public Template page', () => {
  it('shows sections, tasks and blocks stored without ids', async () => {
    await renderSettled(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[{ id: '', title: 'Unnamed', items: [{ id: '', title: 'Old task', contents: [{ type: 'text', value: 'Kept' }] }] }]}
      />,
    );

    expect(screen.getByText('Unnamed')).toBeTruthy();
    expect(screen.getByText('Old task')).toBeTruthy();
    expect(screen.getByText('Kept')).toBeTruthy();
  });

  it('says when a section has no tasks', async () => {
    await renderSettled(<PublicTemplateContent sections={oneSection([])} />);

    expect(screen.getByText('0 tasks')).toBeTruthy();
    expect(screen.getByText('This section does not have any items yet.')).toBeTruthy();
  });

  it('says when the Template has no sections', async () => {
    await renderSettled(<PublicTemplateContent sections={[]} />);

    expect(screen.getByText('No sections are available for this template yet.')).toBeTruthy();
  });
});

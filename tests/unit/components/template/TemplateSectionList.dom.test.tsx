import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublicTemplateRecordStates } from '@/components/template/PublicTemplateRecordStates';
import { TemplateSectionList } from '@/components/template/TemplateSectionList';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

const sections = [
  { id: 'section-1', title: 'Venue', items: [{ id: 'task-1', title: 'Book the hall' }] },
  { id: 'section-2', title: 'Guests', items: [{ id: 'task-2', title: 'Send invites' }] },
];

const toggle = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  });

describe("the sections of a Template's What's included list", () => {
  it('starts with every section open and closes and reopens one on its heading', async () => {
    await renderSettled(<TemplateSectionList sections={sections} />);

    expect(screen.getByText('Book the hall')).toBeTruthy();
    await toggle('Venue');

    expect(screen.queryByText('Book the hall')).toBeNull();
    expect(screen.getByText('Send invites')).toBeTruthy();

    await toggle('Venue');

    expect(screen.getByText('Book the hall')).toBeTruthy();
  });
});

describe('the public Template page while it loads', () => {
  it('says the Template is loading', async () => {
    const children = vi.fn(() => null);
    await renderSettled(
      <PublicTemplateRecordStates loadError={null} loading notFound={false} onRetry={vi.fn()} template={null}>
        {children}
      </PublicTemplateRecordStates>,
    );

    expect(screen.getByText('Loading template…')).toBeTruthy();
    expect(children).not.toHaveBeenCalled();
  });
});

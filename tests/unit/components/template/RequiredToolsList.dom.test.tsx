import React from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RequiredToolsList } from '@/components/template/RequiredToolsList';
import { renderSettled } from '../../../support/renderInTheDom';

const TOOLS = [
  { name: 'Time tracker', url: 'https://track.example.com/start', required: true },
  { name: 'Slideshow app', url: 'http://slides.example.com/deck?id=1', required: false },
];

const toolItem = (name: string) => {
  const item = screen.getByText(name, { exact: false }).closest('li');
  if (!item) throw new Error(`No list item holds ${name}`);
  return item;
};

describe('the Required tools list on the public Template page, Template detail and the Run page', () => {
  it('lists each tool under a "Required tools" heading, marked Required or Optional, with the site it opens', async () => {
    await renderSettled(<RequiredToolsList tools={TOOLS} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Required tools' })).toBeDefined();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(toolItem('Time tracker')).getByText('Required')).toBeDefined();
    expect(within(toolItem('Time tracker')).getByText('track.example.com')).toBeDefined();
    expect(within(toolItem('Slideshow app')).getByText('Optional')).toBeDefined();
  });

  it('links each tool to its URL in a new tab, with no opener and no referrer, and says it opens a new tab', async () => {
    await renderSettled(<RequiredToolsList tools={TOOLS} />);

    const link = screen.getByRole('link', { name: 'Time tracker (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('https://track.example.com/start');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Slideshow app (opens in a new tab)' }).getAttribute('href')).toBe(
      'http://slides.example.com/deck?id=1',
    );
  });

  it('shows a tool whose stored link is not a web address as its name alone, never as a link', async () => {
    await renderSettled(<RequiredToolsList tools={[{ name: 'Old tool', url: 'javascript:alert(1)', required: true }]} />);

    expect(screen.getByText('Old tool')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('takes the heading level of where it sits, and renders nothing without tools', async () => {
    const { container, rerender } = await renderSettled(<RequiredToolsList headingLevel="h3" tools={TOOLS} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Required tools' })).toBeDefined();

    rerender(<RequiredToolsList tools={[]} />);
    expect(container.innerHTML).toBe('');
    rerender(<RequiredToolsList tools={undefined} />);
    expect(container.innerHTML).toBe('');
  });
});

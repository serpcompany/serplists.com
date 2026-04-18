import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';

const template: ChecklistTemplate = {
  id: 'website-launch',
  title: 'Website Launch Checklist',
  description: 'A comprehensive checklist for launching a new website.',
  isPublic: true,
  sections: [
    { id: 's-1', title: 'Pre-launch', items: [{ id: 'i-1', title: 'Task' }] },
    { id: 's-2', title: 'Launch', items: [{ id: 'i-2', title: 'Task' }, { id: 'i-3', title: 'Task' }] },
  ],
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  categories: ['Launch', 'Marketing'],
  ownerProfile: { full_name: 'Design Ops', username: 'designops' },
};

describe('TemplateCard', () => {
  it('renders a discovery-style card with structural stats and a primary action', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TemplateCard template={template} onTemplateClick={vi.fn()} />
      </MemoryRouter>,
    );

    expect(markup).toContain('TEMPLATE PACK');
    expect(markup).toContain('Website Launch Checklist');
    expect(markup).toContain('A comprehensive checklist for launching a new website.');
    expect(markup).toContain('2 sections');
    expect(markup).toContain('3 items');
    expect(markup).toContain('Design Ops');
    expect(markup).toContain('View template');
  });
});

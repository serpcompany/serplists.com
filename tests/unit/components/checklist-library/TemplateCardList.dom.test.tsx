import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import type { ChecklistTemplate } from '@/types/checklist';

import { renderSettled } from '../../../support/renderInTheDom';

const recipe: ChecklistTemplate = {
  id: 'sourdough',
  title: 'Sourdough Loaf',
  type: 'recipe',
  isPublic: true,
  sections: [{ id: 's1', title: 'Mix', items: [{ id: 't1', title: 'Feed the starter' }] }],
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

describe("a library card in the list layout, for a recipe with no categories and no owner's profile", () => {
  it('lays out side by side, shows no category line, and names the Community as its owner', async () => {
    navigation.reset('/templates/');
    const { container } = await renderSettled(<TemplateCard layout="horizontal" template={recipe} />);

    const card = screen.getByRole('article');
    expect(card.getAttribute('data-orientation')).toBe('horizontal');
    expect(card.querySelector('svg.lucide-list')).toBeTruthy();
    expect(screen.queryByText(/^(Launch|Marketing)$/)).toBeNull();
    expect(container.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe('C');
    expect(screen.queryByRole('link', { name: 'Start' })).toBeNull();
  });
});

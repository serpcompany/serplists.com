import type React from 'react';
import { vi } from 'vitest';

import type { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { ChecklistTemplate } from '@/types/checklist';

export type PublicTemplateViewProps = React.ComponentProps<typeof PublicTemplateView>;

export const weddingTemplate: ChecklistTemplate = {
  id: 'template-1',
  slug: 'complete-wedding-planning-checklist',
  title: 'Complete Wedding Planning Checklist',
  description:
    'A wedding planning checklist organized around budget, venue, and guest milestones.',
  sections: [
    {
      id: 'section-1',
      title: 'Early Planning',
      items: [
        {
          id: 'item-1',
          title: 'Set the budget and guest count',
          description: '',
          contents: [],
        },
      ],
    },
  ],
  categories: ['wedding', 'events', 'planning'],
  tags: [],
  type: 'checklist',
  userId: 'user-1',
  isPublic: true,
  version: 1,
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
};

export const publicTemplateViewProps = (overrides: Partial<PublicTemplateViewProps> = {}): PublicTemplateViewProps => ({
  template: weddingTemplate,
  totalItems: 1,
  ownerSlug: 'devinschumacher',
  ownerPath: '/profile/devinschumacher/',
  isAuthenticated: true,
  canSaveTemplate: true,
  canStartRun: true,
  continueRunPath: null,
  isBillingError: false,
  isBillingLoading: false,
  isProUser: false,
  isCreatingRun: false,
  isSaving: false,
  isTeamWorkspace: false,
  isWorkspaceLoading: false,
  workspaceError: null,
  onStartRun: vi.fn(),
  onSaveTemplate: vi.fn(async () => false),
  ...overrides,
});

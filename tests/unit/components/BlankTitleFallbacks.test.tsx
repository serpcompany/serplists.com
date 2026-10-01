import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RunProgressPanel } from '@/components/run-execution/RunProgressSidebar';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';
import { PublicTemplateView } from '@/components/template/PublicTemplateView';
import type { ChecklistSection, ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const sectionsWithLegacyBlankTitles: ChecklistSection[] = [
  { id: 'section-a', title: 'Prep', items: [{ id: 'item-1', title: 'Pack' }] },
  {
    id: 'section-b',
    title: '  ',
    items: [{
      id: 'item-2',
      title: 'Audit',
      contents: [{
        id: 'content-1',
        type: 'subItems',
        value: '',
        subItems: [
          { id: 'sub-1', title: 'Check title' },
          { id: 'sub-2', title: '' },
        ],
      }],
    }],
  },
];

const noop = () => undefined;

describe('blank section and sub-task titles saved before the editor defaulted them, shown as the labels the editor shows instead of an empty heading or an unlabeled checkbox', () => {
  it('shows "Section N" in the run progress panel', () => {
    const html = renderToStaticMarkup(
      <RunProgressPanel
        sections={sectionsWithLegacyBlankTitles}
        progress={0}
        currentSectionId={null}
        currentTaskId={null}
        onSelectTask={noop}
      />,
    );

    expect(html).toContain('Section 2');
  });

  it('shows "Section N" in the task breadcrumb', () => {
    const html = renderToStaticMarkup(
      <TaskExecutionPanel
        section={sectionsWithLegacyBlankTitles[1]}
        sectionIndex={1}
        task={sectionsWithLegacyBlankTitles[1].items[0]}
        taskIndex={0}
        totalTasks={1}
        onFinishRun={noop}
        onNavigateNext={noop}
        onNavigatePrev={noop}
        onSelectTask={noop}
        onToggleSubItem={noop}
        onToggleTask={noop}
        onNotesDraftChange={noop}
        onSaveNotes={async () => true}
        hasNext={false}
        hasPrev={false}
        primaryAction={{ kind: 'complete_task' }}
      />,
    );

    expect(html).toMatch(/<span[^>]*>Section 2<\/span>\s*<span[^>]*>\/<\/span>/);
  });

  it('labels a blank sub-task by its position in a run', () => {
    const html = renderToStaticMarkup(
      <ContentRenderer contents={sectionsWithLegacyBlankTitles[1].items[0].contents ?? []} />,
    );

    expect(html).toContain('Check title');
    expect(html).toContain('Sub-task 2');
  });

  it('shows "Section N" and labels a blank sub-task on the public template content', () => {
    const html = renderToStaticMarkup(
      <PublicTemplateContent initialExpandedItems={{ '1-0': true }} sections={sectionsWithLegacyBlankTitles} />,
    );

    expect(html).toMatch(/<h3[^>]*>Section 2<\/h3>/);
    expect(html).toContain('Sub-task 2');
  });

  it('shows "Section N" in the public template section list', () => {
    const template: ChecklistTemplate = {
      id: 'template-1',
      slug: 'moving',
      title: 'Moving',
      sections: sectionsWithLegacyBlankTitles,
      userId: 'user-1',
      isPublic: true,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };
    navigation.reset('/');
    const html = renderToStaticMarkup(
      <PublicTemplateView
        template={template}
        totalItems={2}
        ownerSlug="owner"
        ownerPath="/profile/owner"
        isAuthenticated={false}
        canSaveTemplate={false}
        canStartRun={false}
        isBillingError={false}
        isBillingLoading={false}
        isProUser={false}
        isCreatingRun={false}
        isSaving={false}
        isTeamWorkspace={false}
        isWorkspaceLoading={false}
        workspaceError={null}
        onStartRun={noop}
        onSaveTemplate={async () => true}
      />,
    );

    expect(html).toMatch(/<span class="font-medium">Section 2<\/span>/);
  });
});

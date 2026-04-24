import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import ChecklistRunPage from '@/pages/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

const mockUseRunExecutionModel = vi.fn();

vi.mock('@/features/run-execution/useRunExecutionModel', () => ({
  useRunExecutionModel: (...args: unknown[]) => mockUseRunExecutionModel(...args),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    getRun: vi.fn(),
    updateRun: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/components/shared/SEOHead', () => ({
  SEOHead: () => null,
}));

const baseRun: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Website Launch Checklist',
  status: 'in_progress',
  progress: 35,
  sections: [
    {
      id: 'section-1',
      title: 'Pre-Launch',
      items: [
        {
          id: 'item-1',
          title: 'Review all page content',
          description: 'Check for typos, broken links, and outdated information.',
          isCompleted: false,
          contents: [],
        },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
};

describe('ChecklistRunPage layout', () => {
  it('renders the private run inside the shared dashboard shell with one persistent app sidebar', () => {
    mockUseRunExecutionModel.mockReturnValue({
      counts: { completed: 2, total: 9 },
      createShare: vi.fn(),
      isSharedRun: false,
      loadError: null,
      loading: false,
      notFound: false,
      progress: 35,
      run: baseRun,
      saveTitle: vi.fn(),
      selectedData: {
        item: baseRun.sections[0].items[0],
        section: baseRun.sections[0],
      },
      selectedItemId: 'item-1',
      setSelectedItemId: vi.fn(),
      completeRun: vi.fn(),
      toggleItem: vi.fn(),
      toggleSubItem: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard/runs/run-1']}>
        <Routes>
          <Route path="/dashboard/runs/:id" element={<ChecklistRunPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('Progress');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('data-run-workspace-shell="true"');
    expect(html).toContain('data-mobile-run-progress="true"');
    expect(html).toContain('data-run-progress-panel="true"');
    expect(html).toContain('Overall Progress');
    expect(html).toContain('Share');
    expect(html).toContain('Task 1 of 1');
    expect(html).toContain('Mark Complete');
    expect(html).toContain('min-h-[calc(100dvh-3.5rem)]');
    expect(html).not.toContain('data-run-progress-sidebar="true"');
    expect(html).not.toContain('border-r border-border bg-card xl:flex xl:w-64');
    expect(html).not.toContain('Tasks');
    expect(html).not.toContain('Work through the run like a docs outline');
  });

  it('renders the shared run as the public copyable checklist flow', () => {
    mockUseRunExecutionModel.mockReturnValue({
      counts: { completed: 2, total: 7 },
      createShare: vi.fn(),
      isSharedRun: true,
      loadError: null,
      loading: false,
      notFound: false,
      progress: 29,
      run: {
        ...baseRun,
        title: 'Project Setup Checklist',
      },
      saveTitle: vi.fn(),
      selectedData: {
        item: baseRun.sections[0].items[0],
        section: baseRun.sections[0],
      },
      selectedItemId: 'item-1',
      setSelectedItemId: vi.fn(),
      completeRun: vi.fn(),
      toggleItem: vi.fn(),
      toggleSubItem: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/share/abc123']}>
        <Routes>
          <Route path="/share/:shareToken" element={<ChecklistRunPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('Copy Link');
    expect(html).toContain('Browse Public Templates');
    expect(html).toContain('Shared run snapshot');
    expect(html).toContain('Run progress');
    expect(html).not.toContain('Create Your Own Copy');
    expect(html).toContain('max-w-[var(--layout-narrow-max)]');
    expect(html).toContain('rounded-[var(--layout-card-radius)]');
    expect(html).not.toContain('rounded-xl');
    expect(html).not.toContain('Creating link...');
    expect(html).not.toContain('Overall Progress');
  });
});

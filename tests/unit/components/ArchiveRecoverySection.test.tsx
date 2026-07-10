import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    workspaceScopeId: 'personal',
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getArchivedTemplates: vi.fn().mockResolvedValue([]),
    getArchivedChecklists: vi.fn().mockResolvedValue([]),
    restoreChecklist: vi.fn(),
    restoreTemplate: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ArchiveRecoverySection', () => {
  it('renders archived templates and runs from the active workspace cache', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['archived-templates', 'personal'], [
      {
        id: 'template-1',
        kind: 'template',
        title: 'Archived Launch Template',
        archivedAt: '2026-07-03T12:00:00.000Z',
      },
    ]);
    queryClient.setQueryData(['archived-runs', 'personal'], [
      {
        id: 'run-1',
        kind: 'run',
        title: 'Archived Launch Run',
        archivedAt: '2026-07-03T12:30:00.000Z',
      },
    ]);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ArchiveRecoverySection />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-archive-recovery-section="true"');
    expect(html).toContain('Archive');
    expect(html).toContain('2 archived');
    expect(html).toContain('Archived Launch Template');
    expect(html).toContain('Archived Launch Run');
    expect(html).toContain('Archived Jul 3, 2026');
    expect(html).toContain('Restore');
  });
});

import '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { TemplateBackup } from '@/components/TemplateBackup';
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';
import { TEMPLATE_IMPORT_MAX_ASSET_BYTES } from '@/lib/schemas/templateAssetLimits';

import { renderSettled } from '../../support/renderInTheDom';

vi.mock('@/hooks/useBillingStatus', () => ({
  useBillingStatus: () => ({ status: 'known', billingEnabled: true, isPaid: true, plan: 'pro', refetch: () => undefined }),
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'importer-1', email: 'importer@example.test' } }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
    canEditTemplates: true,
    isTeamWorkspace: false,
  }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({ allTemplates: [], importTemplates: vi.fn(), refetchTemplates: vi.fn(), templatesError: null, templatesLoading: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const portableTemplate = (title: string, contents: unknown[] = []) => ({
  title,
  sections: [{ title: 'Prep', items: [{ title: 'Pack the bag', contents }] }],
});

const packFile = (templates: unknown[]) =>
  new File(
    [JSON.stringify({ kind: 'serplists-template-pack', schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION, exportedAt: '2026-10-01T00:00:00.000Z', templates })],
    'pack.json',
    { type: 'application/json' },
  );

async function previewTheFile(file: File) {
  await renderSettled(
    <QueryClientProvider client={new QueryClient()}>
      <TemplateBackup />
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText('Select a YAML, JSON, or Markdown template file');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    fireEvent.change(input);
  });
  await screen.findByText('Import Preview');
  return screen.getByRole('button', { name: 'Confirm Import' });
}

describe('the import preview, which applies the import guardrails before Confirm Import', () => {
  it('keeps Confirm Import off for a file of more than 5 Templates, and says why', async () => {
    const confirm = await previewTheFile(packFile(Array.from({ length: 6 }, (_, index) => portableTemplate(`Trip ${index + 1}`))));

    expect(screen.getByText(/6 templates selected; limit is 5 per import/)).toBeTruthy();
    expect(confirm.hasAttribute('disabled')).toBe(true);
  });

  it('only warns about an asset over the upload limit, and still lets the file be confirmed', async () => {
    const oversizedAsset = { type: 'file', value: '/api/uploads/file?key=x', fileName: 'map.pdf', fileSize: TEMPLATE_IMPORT_MAX_ASSET_BYTES + 1 };

    const confirm = await previewTheFile(packFile([portableTemplate('Trip with a map', [oversizedAsset]), portableTemplate('Trip')]));

    expect(screen.getByText(/1 asset over \S+; templates with them will not be imported/)).toBeTruthy();
    expect(confirm.hasAttribute('disabled')).toBe(false);
  });
});

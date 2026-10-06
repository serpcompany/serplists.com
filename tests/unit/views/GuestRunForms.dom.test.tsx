import { navigation } from '../../support/mockedNextNavigation';
import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { readGuestRun } from '@/features/guest-runs/guestRunStore';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';
import GuestRun from '@/views/GuestRun';

import { contentAt, present, taskAt } from '../../support/elements';
import { queryClientsClearedAfterEachTest } from '../../support/queryClientsPerTest';
import { renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

const { templateRecord } = vi.hoisted(() => ({
  templateRecord: {
    loadError: null as string | null,
    loading: false,
    notFound: false,
    reload: () => undefined,
    template: null as ChecklistTemplate | null,
  },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ canRunTemplates: true, isWorkspaceLoading: false }) }));
vi.mock('@/features/guest-runs/useSaveGuestRunToAccount', () => ({ useSaveGuestRunToAccount: () => ({ isSaving: false, save: vi.fn() }) }));
vi.mock('@/features/template-detail/useTemplateDetailRecord', () => ({ useTemplateDetailRecord: () => templateRecord }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

theInMemoryBrowserAsTheWindow();
const newQueryClient = queryClientsClearedAfterEachTest();

const RUN_PAGE = '/profile/alice/client-intake/run/';

const intakeTemplate: ChecklistTemplate = {
  id: 'template-intake',
  slug: 'client-intake',
  title: 'Client Intake',
  isPublic: true,
  userId: 'user-1',
  ownerProfile: { username: 'alice' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  sections: [{
    id: 'section-intake',
    title: 'Intake',
    items: [
      {
        id: 'task-details',
        title: 'Collect details',
        contents: [{
          id: 'form-details',
          type: 'form',
          value: '',
          fields: [
            { id: 'field-name', label: 'Client name', kind: 'text', required: true },
            { id: 'field-contract', label: 'Signed contract', kind: 'file', required: false },
          ],
        }],
      },
      { id: 'task-welcome', title: 'Send the welcome email' },
    ],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(templateRecord, { loadError: null, loading: false, notFound: false, template: intakeTemplate });
  navigation.reset(RUN_PAGE, { routes: ['/profile/[username]/[templateSlug]/run'] });
});

async function openTheRunPage() {
  await renderSettled(
    <QueryClientProvider client={newQueryClient()}>
      <GuestRun />
    </QueryClientProvider>,
  );
  await act(async () => {
    await navigation.settle();
  });
}

const storedRun = (): ChecklistRun => present(readGuestRun(intakeTemplate.id), 'the stored guest run');

const markComplete = () => act(async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));
});

describe("a guest run of a Template with a form", () => {
  it('refuses to complete the task until its required field is answered, says which field, and moves focus to it', async () => {
    await openTheRunPage();

    await markComplete();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Finish this task's form first. Client name: Fill in this field.");
    });
    const name = screen.getByRole('textbox', { name: 'Client name' });
    expect(screen.getByText('Fill in this field.')).toBeTruthy();
    expect(document.activeElement).toBe(name);
    expect(taskAt(storedRun(), 0, 0).isCompleted).toBe(false);

    await typeInto(name, 'Acme');
    await act(async () => {
      fireEvent.blur(name);
    });
    await waitFor(() => {
      expect(contentAt(taskAt(storedRun(), 0, 0), 0).fields?.[0]?.answer).toBe('Acme');
    });
    expect(screen.queryByText('Fill in this field.')).toBeNull();

    await markComplete();
    await waitFor(() => {
      expect(taskAt(storedRun(), 0, 0).isCompleted).toBe(true);
    });
    expect(contentAt(taskAt(storedRun(), 0, 0), 0).fields?.[0]?.answer).toBe('Acme');
  });

  it('asks the visitor to log in to upload a file, and comes back to this run after', async () => {
    await openTheRunPage();

    expect(screen.getByRole('link', { name: 'Signed contract Log in to upload' }).getAttribute('href')).toBe(
      `/login/?next=${encodeURIComponent(RUN_PAGE)}`,
    );
  });
});

import React, { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { RunProvenancePanel } from '@/components/run-execution/RunProvenancePanel';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { ChecklistRun, RunProvenance } from '@/types/checklist';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/clipboard', () => ({ copyTextToClipboard: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const alice = { userId: 'user-a', name: 'Alice Admin', username: 'alice' };
const bob = { userId: 'user-b', name: 'Bob Runner', username: 'bob' };

const runWith = (provenance: RunProvenance | undefined, extra: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'run-1234',
  templateId: 'tpl-1',
  title: 'Launch Run',
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-10-01T09:00:00.000Z',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-02T10:30:00.000Z',
  userId: 'user-a',
  templateVersion: 3,
  revision: 7,
  provenance,
  ...extra,
});

const fullProvenance = (overrides: Partial<RunProvenance>): RunProvenance => ({
  origin: 'web',
  startedBy: alice,
  owner: { type: 'personal', id: 'user-a', name: 'Alice Admin' },
  template: { id: 'tpl-1', title: 'Launch Playbook', version: 3 },
  agentKeyName: null,
  authorizedBy: null,
  createdBy: alice,
  assignedTo: null,
  completedBy: null,
  ...overrides,
});

const details = (): Record<string, string> => {
  const list = screen.getByRole('button', { name: 'Hide Details' }).closest('[data-run-provenance]')?.querySelector('dl');
  if (!list) throw new Error('No details list');
  return Object.fromEntries(
    within(list as HTMLElement).getAllByRole('term').map((term) => [term.textContent ?? '', term.nextElementSibling?.textContent ?? '']),
  );
};

async function openTheDetails() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));
  });
}

describe("the Run page's provenance", () => {
  it('says who started a Personal web run and when, and its details name the owner, Template, version and revision', async () => {
    render(<RunProvenancePanel run={runWith(fullProvenance({}))} />);

    expect(screen.getByText('Started by Alice Admin via Web')).toBeTruthy();
    expect(screen.getByText(/^Started Oct 1, 2026.* · Updated Oct 2, 2026/)).toBeTruthy();

    await openTheDetails();

    expect(details()).toMatchObject({
      'Run ID': 'run-1234',
      Template: 'Launch Playbook',
      'Template version': '3',
      'Resource owner': 'Personal',
      'Created by': 'Alice Admin',
      'Started by': 'Alice Admin',
      Origin: 'Web',
      Revision: '7',
    });
    expect(Object.keys(details())).not.toContain('Run Key');
    expect(Object.keys(details())).not.toContain('Assigned to');
  });

  it('names an MCP run\'s Run Key and the person who authorized it', async () => {
    render(<RunProvenancePanel run={runWith(fullProvenance({ origin: 'mcp', agentKeyName: 'Codex SOP Runner', authorizedBy: alice }))} />);

    expect(screen.getByText('Started by Codex SOP Runner via MCP · authorized by Alice Admin')).toBeTruthy();
    await openTheDetails();
    expect(details()).toMatchObject({ Origin: 'MCP', 'Run Key': 'Codex SOP Runner', 'Authorized by': 'Alice Admin' });
  });

  it("names an Organization run's Organization, starter, assignee and completer", async () => {
    render(
      <RunProvenancePanel
        run={runWith(
          fullProvenance({
            owner: { type: 'organization', id: 'org-1', name: 'Acme Org' },
            startedBy: bob,
            assignedTo: bob,
            completedBy: bob,
          }),
          { status: 'completed', completedAt: '2026-10-03T12:00:00.000Z' },
        )}
      />,
    );

    await openTheDetails();
    expect(details()).toMatchObject({
      'Resource owner': 'Acme Org',
      'Created by': 'Alice Admin',
      'Started by': 'Bob Runner',
      'Assigned to': 'Bob Runner',
      'Completed by': 'Bob Runner',
    });
    expect(details()['Completed']).toMatch(/Oct 3, 2026/);
  });

  it('says Unknown and Not recorded for an older run, never a guess', async () => {
    render(<RunProvenancePanel run={runWith(fullProvenance({ origin: 'unknown', startedBy: null, createdBy: null }))} />);

    expect(screen.queryByText(/via/)).toBeNull();
    await openTheDetails();
    expect(details()).toMatchObject({ Origin: 'Unknown', 'Created by': 'Not recorded', 'Started by': 'Not recorded' });
  });

  it('copies the run ID', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
    render(<RunProvenancePanel run={runWith(fullProvenance({}))} />);
    await openTheDetails();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy run ID' }));
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith('run-1234');
    expect(toast.success).toHaveBeenCalledWith('Run ID copied');
  });
});

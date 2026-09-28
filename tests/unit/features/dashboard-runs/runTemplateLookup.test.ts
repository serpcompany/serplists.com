import { describe, expect, it } from 'vitest';

import {
  buildRunTemplateLookup,
  filterDashboardRuns,
  findRunTemplate,
} from '@/features/dashboard-runs/runTemplateLookup';
import type { ChecklistRun } from '@/types/checklist';

const run = (overrides: Partial<ChecklistRun>): ChecklistRun => ({
  id: 'run-1',
  templateId: '',
  title: 'Acme',
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2024-01-01T00:00:00Z',
  userId: 'user-1',
  ...overrides,
});

describe('buildRunTemplateLookup', () => {
  it('includes private workspace Templates that the public catalog never returns', () => {
    const lookup = buildRunTemplateLookup(
      [{ id: 'public-1', title: 'Public Launch' }],
      [{ id: 'private-1', title: 'Client Onboarding' }],
    );

    expect(lookup.get('private-1')?.title).toBe('Client Onboarding');
    expect(lookup.get('public-1')?.title).toBe('Public Launch');
  });

  it('keeps catalog-only Templates when the workspace list is an Organization list', () => {
    const lookup = buildRunTemplateLookup(
      [{ id: 'someone-elses-public', title: 'Shared Playbook' }],
      [{ id: 'org-private', title: 'Org Only' }],
    );

    expect(lookup.get('someone-elses-public')?.title).toBe('Shared Playbook');
  });

  it('prefers the workspace copy over a possibly stale catalog copy', () => {
    const lookup = buildRunTemplateLookup(
      [{ id: 'template-1', title: 'Old title' }],
      [{ id: 'template-1', title: 'New title' }],
    );

    expect(lookup.get('template-1')?.title).toBe('New title');
    expect(lookup.size).toBe(1);
  });

  it('works before the workspace list has loaded', () => {
    expect(buildRunTemplateLookup([{ id: 'a', title: 'A' }], undefined).size).toBe(1);
  });
});

describe('findRunTemplate', () => {
  it('never matches a run started from a library Template (empty template id)', () => {
    const lookup = new Map([['', { id: '', title: 'Should not match' }]]);

    expect(findRunTemplate(lookup, '')).toBeUndefined();
    expect(findRunTemplate(lookup, undefined)).toBeUndefined();
  });
});

describe('filterDashboardRuns', () => {
  const lookup = buildRunTemplateLookup(
    [],
    [
      {
        id: 'private-1',
        title: 'Client Onboarding',
        ownerProfile: { username: 'ops-lead', full_name: 'Casey Ops' },
      },
    ],
  );
  const runs = [
    run({ id: 'run-acme', templateId: 'private-1', title: 'Acme', startedAt: '2024-01-02T00:00:00Z' }),
    run({ id: 'run-other', templateId: '', title: 'Other', status: 'completed', startedAt: '2024-01-03T00:00:00Z' }),
  ];

  it('finds a renamed run by its private source Template title and owner', () => {
    expect(filterDashboardRuns(runs, lookup, 'client onboarding', 'all').map((r) => r.id)).toEqual(['run-acme']);
    expect(filterDashboardRuns(runs, lookup, 'casey', 'all').map((r) => r.id)).toEqual(['run-acme']);
  });

  it('filters by status and sorts newest first', () => {
    expect(filterDashboardRuns(runs, lookup, '', 'all').map((r) => r.id)).toEqual(['run-other', 'run-acme']);
    expect(filterDashboardRuns(runs, lookup, '', 'in_progress').map((r) => r.id)).toEqual(['run-acme']);
  });
});

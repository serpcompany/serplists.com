import { describe, expect, it } from 'vitest';

import {
  buildRunTemplateLookup,
  filterDashboardRuns,
  findRunTemplate,
  runTemplateFilterOptions,
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

  it("keeps only the chosen Template's runs, together with the status and search filters", () => {
    const withADoneAcme = [
      ...runs,
      run({ id: 'run-acme-done', templateId: 'private-1', title: 'Acme Done', status: 'completed', startedAt: '2024-01-04T00:00:00Z' }),
    ];

    expect(filterDashboardRuns(withADoneAcme, lookup, '', 'all', 'private-1').map((r) => r.id)).toEqual(['run-acme-done', 'run-acme']);
    expect(filterDashboardRuns(withADoneAcme, lookup, '', 'completed', 'private-1').map((r) => r.id)).toEqual(['run-acme-done']);
    expect(filterDashboardRuns(withADoneAcme, lookup, 'done', 'all', 'private-1').map((r) => r.id)).toEqual(['run-acme-done']);
    expect(filterDashboardRuns(withADoneAcme, lookup, '', 'all', 'no-such-template')).toEqual([]);
  });
});

describe('runTemplateFilterOptions', () => {
  const lookup = buildRunTemplateLookup(
    [],
    [
      { id: 'tpl-b', title: 'Beta Launch' },
      { id: 'tpl-a', title: 'Alpha Audit' },
      { id: 'tpl-quiet', title: 'Quiet Template' },
    ],
  );
  const runs = [
    run({ id: 'run-1', templateId: 'tpl-b' }),
    run({ id: 'run-2', templateId: 'tpl-a' }),
    run({ id: 'run-3', templateId: 'tpl-b' }),
    run({ id: 'run-4', templateId: 'tpl-deleted' }),
  ];

  it('offers each known Template the runs came from once, by title', () => {
    expect(runTemplateFilterOptions(runs, lookup, null)).toEqual([
      { id: 'tpl-a', title: 'Alpha Audit' },
      { id: 'tpl-b', title: 'Beta Launch' },
    ]);
  });

  it('also offers the chosen Template when none of the runs came from it, untitled when it is unknown', () => {
    expect(runTemplateFilterOptions(runs, lookup, 'tpl-quiet').map((option) => option.id)).toEqual(['tpl-a', 'tpl-b', 'tpl-quiet']);
    expect(runTemplateFilterOptions(runs, lookup, 'tpl-gone')).toContainEqual({ id: 'tpl-gone', title: null });
  });
});

type Row = Record<string, unknown>;

export const ARCHIVED_AT = '2026-07-03T12:00:00.000Z';

export function startedJustNow(): Row {
  return { started_at: new Date().toISOString(), created_at: new Date().toISOString() };
}

export function personalRunRow(overrides: Row = {}): Row {
  return { id: 'run-1', user_id: 'user-123', team_id: null, title: 'Run', items: '[]', status: 'in_progress', ...overrides };
}

export function organizationRunRow(overrides: Row = {}): Row {
  return { id: 'run-1', user_id: 'creator-1', team_id: 'team-1', title: 'Team Run', items: '[]', status: 'in_progress', ...overrides };
}

export function activeMember(role: string, overrides: Row = {}): Row {
  return { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role, status: 'active', ...overrides };
}

export function personalTemplateRow(overrides: Row = {}): Row {
  return { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, ...overrides };
}

export function organizationTemplateRow(overrides: Row = {}): Row {
  return { id: 'template-1', user_id: 'creator-1', owner_type: 'team', team_id: 'team-1', ...overrides };
}

export function sharedRunRow(overrides: Row = {}): Row {
  return {
    id: 'shared-run',
    template_id: 'template-2',
    title: 'Shared Run',
    status: 'in_progress',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    user_id: 'owner-123',
    share_token: 'shared-run',
    is_public: true,
    revision: 3,
    ...overrides,
  };
}

export function publicTemplateSource(overrides: Row = {}): Row {
  return {
    id: 'template-1',
    title: 'Public Template',
    description: '',
    items: JSON.stringify([]),
    category: '[]',
    tags: '[]',
    user_id: 'other-user',
    is_public: true,
    slug: 'public-template',
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: null,
    version: 1,
    ...overrides,
  };
}

export const ONE_SECTION_WITH_ONE_ITEM = [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }];

export function templateRowToExport(overrides: Row = {}): Row {
  return {
    id: 'template-1',
    title: 'Template',
    description: '',
    items: JSON.stringify(ONE_SECTION_WITH_ONE_ITEM),
    category: '[]',
    tags: '[]',
    user_id: 'user-123',
    is_public: 0,
    slug: 'template',
    created_at: new Date().toISOString(),
    updated_at: null,
    version: 1,
    ...overrides,
  };
}

export const releaseSectionWithTwoSubTasks = (task: { title: string; notes?: string }) => [
  {
    id: 'section-1',
    title: 'Release',
    items: [
      {
        id: 'task-1',
        ...task,
        isCompleted: false,
        contents: [
          {
            type: 'subItems',
            subItems: [
              { id: 'sub-1', title: 'Tests pass', isCompleted: false },
              { id: 'sub-2', title: 'Preview checked', isCompleted: false },
            ],
          },
        ],
      },
    ],
  },
];

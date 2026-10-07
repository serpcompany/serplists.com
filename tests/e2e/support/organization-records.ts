const sections = [
  { id: 'sec-1', title: 'Section', items: [
    { id: 'task-a', title: 'Task A' },
    { id: 'task-b', title: 'Task B' },
  ] },
];

export const organizationTemplate = {
  id: 'tpl-org',
  title: 'Org Playbook',
  description: 'Private Organization template',
  items: JSON.stringify(sections),
  is_public: 0,
  team_id: 'team-1',
  user_id: 'user-owner',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

export const organizationRun = {
  id: 'run-org',
  title: 'Org Run',
  template_id: 'tpl-org',
  items: JSON.stringify(sections),
  status: 'in_progress',
  is_stale: true,
  is_public: 0,
  team_id: 'team-1',
  user_id: 'user-owner',
  revision: 1,
  started_at: '2026-07-02T00:00:00.000Z',
};

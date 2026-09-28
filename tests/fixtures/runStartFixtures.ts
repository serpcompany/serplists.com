// A stored template that carries run state (ticked tasks and Sub-tasks, the legacy
// `completed` key, run notes), as API-written, legacy, or cloned templates can. Every path
// that starts a run from it (web create, MCP start_run) must store UNTICKED_RUN_SECTIONS.
// Content blocks carry a text `value`, as stored content must (src/lib/schemas/storedSections.ts).

export const TICKED_TEMPLATE_SECTIONS = [
  {
    id: 'section-1',
    title: 'Release',
    items: [
      {
        id: 'task-1',
        title: 'Verify',
        isCompleted: true,
        notes: 'Checked by the last runner',
        contents: [
          { type: 'text', value: 'Run the checks' },
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-1', title: 'Tests pass', isCompleted: true, notes: 'green' },
              { id: 'sub-2', title: 'Preview checked', completed: true },
              { id: 'sub-3', title: 'Docs updated' },
            ],
          },
        ],
      },
      { id: 'task-2', title: 'Legacy task', completed: true, subItems: [{ id: 'sub-4', title: 'Direct', isCompleted: true }] },
      { id: 'task-3', title: 'Plain task' },
    ],
  },
];

export const UNTICKED_RUN_SECTIONS = [
  {
    id: 'section-1',
    title: 'Release',
    items: [
      {
        id: 'task-1',
        title: 'Verify',
        isCompleted: false,
        contents: [
          { type: 'text', value: 'Run the checks' },
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-1', title: 'Tests pass', isCompleted: false },
              { id: 'sub-2', title: 'Preview checked', isCompleted: false },
              { id: 'sub-3', title: 'Docs updated', isCompleted: false },
            ],
          },
        ],
      },
      { id: 'task-2', title: 'Legacy task', isCompleted: false, subItems: [{ id: 'sub-4', title: 'Direct', isCompleted: false }] },
      { id: 'task-3', title: 'Plain task', isCompleted: false },
    ],
  },
];

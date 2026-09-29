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

// A template stored without ids the API accepts (rows older than stable ids, or a numeric,
// blank or whitespace id). A run starts with the ids the Template's editor shows and its next
// save stores, so that save reconciles the run by id instead of retiring its work.
export const LEGACY_ID_TEMPLATE_SECTIONS = [
  {
    id: '  ',
    title: 'Release',
    items: [
      {
        id: 1,
        title: 'Verify',
        isCompleted: true,
        contents: [
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 7, title: 'Tests pass', isCompleted: true },
              { title: 'Docs updated' },
            ],
          },
        ],
      },
      { id: 'task-2', title: 'Plain task' },
      { id: '', title: 'Legacy task', subItems: [{ id: 'sub-direct', title: 'Direct' }] },
    ],
  },
];

export const LEGACY_ID_RUN_SECTIONS = [
  {
    id: 'legacy-section-1',
    title: 'Release',
    items: [
      {
        id: 'legacy-item-1-1',
        title: 'Verify',
        isCompleted: false,
        contents: [
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'legacy-subitem-1-1-1', title: 'Tests pass', isCompleted: false },
              { id: 'legacy-subitem-1-1-2', title: 'Docs updated', isCompleted: false },
            ],
          },
        ],
      },
      { id: 'task-2', title: 'Plain task', isCompleted: false },
      { id: 'legacy-item-1-3', title: 'Legacy task', isCompleted: false, subItems: [{ id: 'sub-direct', title: 'Direct', isCompleted: false }] },
    ],
  },
];

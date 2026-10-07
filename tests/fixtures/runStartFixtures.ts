export const TEMPLATE_SECTIONS_CARRYING_RUN_STATE = [
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
          {
            id: 'c-form',
            type: 'form',
            value: '',
            fields: [
              { id: 'field-1', label: 'Client', kind: 'text', required: true, answer: 'Left by the last runner' },
              { id: 'field-2', label: 'Plan', kind: 'select', required: false, options: [{ id: 'option-1', label: 'Pro' }], answer: 'option-1' },
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
          {
            id: 'c-form',
            type: 'form',
            value: '',
            fields: [
              { id: 'field-1', label: 'Client', kind: 'text', required: true },
              { id: 'field-2', label: 'Plan', kind: 'select', required: false, options: [{ id: 'option-1', label: 'Pro' }] },
            ],
          },
        ],
      },
      { id: 'task-2', title: 'Legacy task', isCompleted: false, subItems: [{ id: 'sub-4', title: 'Direct', isCompleted: false }] },
      { id: 'task-3', title: 'Plain task', isCompleted: false },
    ],
  },
];

export const TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS = [
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

export const RUN_SECTIONS_WITH_LEGACY_IDS = [
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

export const storedSections = [
  {
    id: 'section-1',
    title: 'Launch',
    items: [
      {
        id: 'item-1',
        title: 'Write copy',
        description: 'Draft it',
        contents: [
          { id: 'content-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] },
        ],
      },
      { id: 'item-2', title: 'Publish' },
    ],
  },
];

export const storedSectionsAsTheEditorResendsThem = [
  {
    title: 'Launch',
    id: 'section-1',
    items: [
      {
        isCompleted: false,
        contents: [
          {
            value: '',
            type: 'subItems',
            id: 'content-1',
            fileName: undefined,
            subItems: [{ title: 'Short', id: 'sub-1', isCompleted: false }],
          },
        ],
        description: 'Draft it',
        title: 'Write copy',
        id: 'item-1',
      },
      { id: 'item-2', title: 'Publish', description: '', contents: [], isCompleted: false, completed: false, notes: '' },
    ],
  },
];

// Hostile checklist JSON that reached stored templates and runs through the API before
// section content was validated, and crashed every Runs list that held one.
const withContent = (content: unknown) => [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', contents: [content] }] }];

export const hostileSections: Array<[string, unknown[]]> = [
  ['a string subItems', withContent({ type: 'subItems', value: '', subItems: 'x' })],
  ['an object subItems', withContent({ type: 'subItems', value: '', subItems: {} })],
  ['a number subItems', withContent({ type: 'subItems', value: '', subItems: 5 })],
  ['an object value', withContent({ type: 'text', value: {} })],
  ['an unknown type', withContent({ type: 'poll', value: 'x' })],
  ['a missing type', withContent({ value: 'x' })],
  ['a non-object content entry', withContent('x')],
  ['a non-object Sub-task', withContent({ type: 'subItems', value: '', subItems: ['x', null] })],
  ['an object Sub-task title', withContent({ type: 'subItems', value: '', subItems: [{ id: 'a', title: {} }] })],
  ['non-array contents', [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: 'x' }] }]],
  ['non-array task subItems', [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', subItems: 'x' }] }]],
  ['non-array items', [{ id: 's1', title: 'S', items: 'x' }]],
  ['an object description', [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', description: {} }] }]],
  ['object notes', [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', notes: { text: 'x' } }] }]],
  ['an object item title', [{ id: 's1', title: 'S', items: [{ id: 'i1', title: { en: 'x' } }] }]],
  ['a non-object section', ['x']],
  ['a non-object item', [{ id: 's1', title: 'S', items: [7] }]],
];

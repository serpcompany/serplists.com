export const sectionsWithContents = (...contents: unknown[]) => [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', contents }] }];

const withContent = (content: unknown) => sectionsWithContents(content);

const withFormField = (field: Record<string, unknown>) => withContent({ type: 'form', value: '', fields: [field] });

export const MALFORMED_CONTENTS_A_TEMPLATE_STORED = [
  { type: 'subItems', value: '', subItems: 'x' },
  { type: 'text', value: {} },
];

export const THE_SAME_CONTENTS_MADE_SAFE = [
  { type: 'subItems', value: '', subItems: [] },
  { type: 'text', value: '' },
];

export const malformedSectionsStoredBeforeValidation: Array<[string, unknown[]]> = [
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
  ['a string form field list', withContent({ type: 'form', value: '', fields: 'x' })],
  ['a non-object form field', withContent({ type: 'form', value: '', fields: ['x'] })],
  ['a form field of an unknown kind', withFormField({ id: 'f', label: 'Name', kind: 'color' })],
  ['a form field without a kind', withFormField({ id: 'f', label: 'Name' })],
  ['an object form field label', withFormField({ id: 'f', label: {}, kind: 'text' })],
  ['a text required flag', withFormField({ id: 'f', label: 'Name', kind: 'text', required: 'yes' })],
  ['an object help text', withFormField({ id: 'f', label: 'Name', kind: 'text', description: { en: 'x' } })],
  ['a string option list', withFormField({ id: 'f', label: 'Plan', kind: 'select', options: 'x' })],
  ['a non-object option', withFormField({ id: 'f', label: 'Plan', kind: 'select', options: ['x'] })],
  ['an object option label', withFormField({ id: 'f', label: 'Plan', kind: 'select', options: [{ id: 'a', label: {} }] })],
  ['a text minimum', withFormField({ id: 'f', label: 'Count', kind: 'number', min: '1' })],
  ['a number answer to a text field', withFormField({ id: 'f', label: 'Name', kind: 'text', answer: 5 })],
  ['a text answer to a number field', withFormField({ id: 'f', label: 'Count', kind: 'number', answer: '5' })],
  ['a text answer to a multiple choice field', withFormField({ id: 'f', label: 'Tags', kind: 'multiSelect', answer: 'a' })],
  ['a number among multiple choice answers', withFormField({ id: 'f', label: 'Tags', kind: 'multiSelect', answer: ['a', 2] })],
  ['a text answer to a checkbox', withFormField({ id: 'f', label: 'Agree', kind: 'checkbox', answer: 'yes' })],
  ['a file answer without a URL', withFormField({ id: 'f', label: 'Upload', kind: 'file', answer: { fileName: 'a.pdf' } })],
];

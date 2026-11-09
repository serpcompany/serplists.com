import { describe, expect, it } from 'vitest';

import { isSectionsShape, normalizeSections, resetSectionsCompletion } from '@/lib/utils/checklistSections';

describe('telling stored sections from a flat list of tasks', () => {
  it('takes an empty list or a list of sections, and nothing else', () => {
    expect(isSectionsShape([])).toBe(true);
    expect(isSectionsShape([{ id: 's1', title: 'Shelter', items: [] }])).toBe(true);
    expect(isSectionsShape([{ id: 'i1', title: 'Pack the tent' }])).toBe(false);
    expect(isSectionsShape('[]')).toBe(false);
  });
});

describe('sections read from a stored Template or Run', () => {
  it('reads anything that is not a list as no sections', () => {
    expect(normalizeSections({ id: 's1', items: [] })).toEqual([]);
  });

  it('drops a content block of a kind it cannot show, and gives a form block with no field list no fields', () => {
    const [task] = normalizeSections([
      { id: 's1', title: 'Shelter', items: [{ id: 'i1', title: 'Pack the tent', contents: [{ type: 'audio', value: 'a.mp3' }, { id: 'c2', type: 'form', value: '' }] }] },
    ])[0]?.items ?? [];

    expect(task?.contents).toEqual([{ id: 'c2', type: 'form', value: '', fields: [] }]);
  });

  it('names a task stored without a title by nothing, so the page shows its place instead', () => {
    const [task] = normalizeSections([{ id: 's1', title: 'Shelter', items: [{ id: 'i1', notes: 'Bring the tent' }] }])[0]?.items ?? [];

    expect(task?.title).toBe('');
  });

  it('starts every sub-task of a completed task over when the run starts again', () => {
    const subItems = [
      { id: 'pegs', title: 'Pegs', isCompleted: true },
      { id: 'poles', title: 'Poles', isCompleted: false },
    ];
    const [section] = resetSectionsCompletion([
      { id: 's1', title: 'Shelter', items: [{ id: 'i1', title: 'Pack the tent', isCompleted: true, contents: [{ id: 'c1', type: 'subItems', value: '', subItems }] }] },
    ]);

    expect(section?.items[0]).toMatchObject({
      isCompleted: false,
      contents: [{ id: 'c1', type: 'subItems', subItems: [{ id: 'pegs', title: 'Pegs', isCompleted: false }, { id: 'poles', title: 'Poles', isCompleted: false }] }],
    });
  });
});

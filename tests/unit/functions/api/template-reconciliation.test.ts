import { describe, expect, it } from 'vitest';

import {
  calculateRunProgress,
  reconcileRunSections,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';

const originalRun = [
  {
    id: 'section-content',
    title: 'Content',
    items: [
      {
        id: 'item-copy',
        title: 'Write copy',
        description: 'Old instructions',
        isCompleted: true,
        notes: 'Approved by Devin',
        contents: [
          {
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-short', title: 'Short description', isCompleted: true },
              { id: 'sub-long', title: 'Long description', isCompleted: false },
            ],
          },
        ],
      },
      {
        id: 'item-retired',
        title: 'Create legacy badge',
        isCompleted: true,
        notes: 'Kept for audit history',
      },
    ],
  },
];

describe('template run reconciliation', () => {
  it('preserves run-owned state by stable identity while applying additions, renames, reorders, and removals', () => {
    const evolvedTemplate = [
      {
        id: 'section-content',
        title: 'Launch content',
        items: [
          {
            id: 'item-media',
            title: 'Create screenshots',
            isCompleted: true,
          },
          {
            id: 'item-copy',
            title: 'Write listing copy',
            description: 'New instructions',
            contents: [
              {
                type: 'subItems',
                value: '',
                subItems: [
                  { id: 'sub-long', title: 'Full description' },
                  { id: 'sub-tagline', title: 'Tagline', isCompleted: true },
                  { id: 'sub-short', title: 'Short copy' },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = reconcileRunSections(originalRun, evolvedTemplate, []);

    expect(result.sections[0].title).toBe('Launch content');
    expect(result.sections[0].items.map((item) => item.id)).toEqual([
      'item-media',
      'item-copy',
    ]);
    expect(result.sections[0].items[0].isCompleted).toBe(false);
    expect(result.sections[0].items[1]).toMatchObject({
      id: 'item-copy',
      title: 'Write listing copy',
      description: 'New instructions',
      isCompleted: false,
      notes: 'Approved by Devin',
    });
    expect(result.sections[0].items[1].contents[0].subItems).toEqual([
      { id: 'sub-long', title: 'Full description', isCompleted: false },
      { id: 'sub-tagline', title: 'Tagline', isCompleted: false },
      { id: 'sub-short', title: 'Short copy', isCompleted: true },
    ]);
    expect(result.retired).toEqual([
      expect.objectContaining({
        kind: 'item',
        sectionId: 'section-content',
        item: expect.objectContaining({ id: 'item-retired', notes: 'Kept for audit history' }),
      }),
    ]);
    expect(calculateRunProgress(result.sections)).toBe(20);
  });

  it('archives removed sub-items without counting them toward readiness', () => {
    const evolvedTemplate = [
      {
        id: 'section-content',
        title: 'Content',
        items: [
          {
            id: 'item-copy',
            title: 'Write copy',
            contents: [
              {
                type: 'subItems',
                value: '',
                subItems: [{ id: 'sub-short', title: 'Short description' }],
              },
            ],
          },
        ],
      },
    ];

    const result = reconcileRunSections(originalRun, evolvedTemplate, []);

    expect(result.retired).toEqual([
      expect.objectContaining({ kind: 'subItem', subItem: expect.objectContaining({ id: 'sub-long' }) }),
      expect.objectContaining({ kind: 'item', item: expect.objectContaining({ id: 'item-retired' }) }),
    ]);
    expect(calculateRunProgress(result.sections)).toBe(100);
  });

  it('never reports 100% while a task or sub-task is left, however large the run', () => {
    // 40 tasks with 4 sub-tasks each is 200 units; 199 of 200 is 99.5%, which used to round to 100.
    const sections = [
      {
        id: 'section-1',
        title: 'Launch',
        items: Array.from({ length: 40 }, (_, itemIndex) => ({
          id: `item-${itemIndex}`,
          title: `Task ${itemIndex}`,
          isCompleted: true,
          contents: [
            {
              type: 'subItems',
              value: '',
              subItems: Array.from({ length: 4 }, (_, subIndex) => ({
                id: `sub-${itemIndex}-${subIndex}`,
                title: `Step ${subIndex}`,
                isCompleted: !(itemIndex === 0 && subIndex === 0),
              })),
            },
          ],
        })),
      },
    ];

    expect(calculateRunProgress(sections)).toBe(99);
  });

  it('rejects missing or duplicate identities at every template level', () => {
    expect(validateStableTemplateIdentities([{ title: 'No id', items: [] }])).toMatch(/section/i);
    expect(validateStableTemplateIdentities([
      {
        id: 'section-1',
        title: 'Section',
        items: [
          { id: 'item-1', title: 'One' },
          { id: 'item-1', title: 'Duplicate' },
        ],
      },
    ])).toMatch(/duplicate item/i);
    expect(validateStableTemplateIdentities([
      {
        id: 'section-1',
        title: 'Section',
        items: [
          {
            id: 'item-1',
            title: 'One',
            contents: [{ type: 'subItems', value: '', subItems: [{ title: 'No id' }] }],
          },
        ],
      },
    ])).toMatch(/sub-item/i);
  });

  it('preserves legacy id-less progress on the first template evolution', () => {
    const legacyRun = [
      {
        title: 'Content',
        items: [
          {
            title: 'Write copy',
            isCompleted: true,
            notes: 'Legacy note',
            contents: [{
              type: 'subItems',
              value: '',
              subItems: [{ title: 'Short copy', isCompleted: true }],
            }],
          },
        ],
      },
    ];
    const firstEvolution = [
      {
        title: 'Renamed content section',
        items: [
          {
            title: 'Renamed copy task',
            contents: [{
              type: 'subItems',
              value: '',
              subItems: [{ title: 'Renamed short copy' }, { title: 'New long copy' }],
            }],
          },
          { title: 'New screenshots' },
        ],
      },
    ];

    const result = reconcileRunSections(legacyRun, firstEvolution, []);

    expect(result.sections[0]).toMatchObject({ id: 'legacy-section-1', title: 'Renamed content section' });
    expect(result.sections[0].items[0]).toMatchObject({
      id: 'legacy-item-1-1',
      title: 'Renamed copy task',
      // 'New long copy' arrives incomplete, so the task is no longer complete.
      isCompleted: false,
      notes: 'Legacy note',
    });
    expect(result.sections[0].items[0].contents[0].subItems).toEqual([
      expect.objectContaining({ id: 'legacy-subitem-1-1-1', isCompleted: true }),
      expect.objectContaining({ id: 'legacy-subitem-1-1-2', isCompleted: false }),
    ]);
    expect(result.sections[0].items[1]).toMatchObject({
      id: 'legacy-item-1-2',
      isCompleted: false,
    });
  });

  it('normalizes a legacy flat run before reconciling its first sectioned template edit', () => {
    const flatRun = [
      {
        title: 'Publish listing',
        isCompleted: true,
        notes: 'Submitted copy is approved',
      },
    ];
    const sectionedTemplate = [
      {
        id: '1',
        title: 'Checklist',
        items: [
          { id: '1-1', title: 'Publish renamed listing' },
          { id: '1-2', title: 'Upload new screenshots' },
        ],
      },
    ];

    const result = reconcileRunSections(flatRun, sectionedTemplate, []);

    expect(result.retired).toEqual([]);
    expect(result.sections).toEqual([
      expect.objectContaining({
        id: '1',
        items: [
          expect.objectContaining({
            id: 'legacy-item-1-1',
            title: 'Publish renamed listing',
            isCompleted: true,
            notes: 'Submitted copy is approved',
          }),
          expect.objectContaining({
            id: '1-2',
            title: 'Upload new screenshots',
            isCompleted: false,
          }),
        ],
      }),
    ]);
  });

  describe('task completion follows its Sub-tasks', () => {
    type Json = Record<string, any>;
    const subTasks = (...entries: Array<[string, boolean?]>) =>
      entries.map(([id, isCompleted]) => ({ id, title: id, ...(isCompleted === undefined ? {} : { isCompleted }) }));
    const block = (subItems: Json[]) => ({ type: 'subItems', value: '', subItems });
    const run = (isCompleted: boolean, ...blocks: Json[][]) => [
      { id: 's', title: 'S', items: [{ id: 'task', title: 'Write copy', isCompleted, contents: blocks.map(block) }, { id: 'publish', title: 'Publish', isCompleted: false }] },
    ];
    const template = (...blocks: Json[][]) => [
      { id: 's', title: 'S', items: [{ id: 'task', title: 'Write copy', contents: blocks.map(block) }, { id: 'publish', title: 'Publish' }] },
    ];
    const reconciledTask = (previous: unknown[], next: unknown[]) =>
      reconcileRunSections(previous, next, []).sections[0].items[0] as Json;
    const allSubTasks = (item: Json): Json[] => [
      ...(item.subItems ?? []),
      ...(item.contents ?? []).flatMap((content: Json) => content.subItems ?? []),
    ];

    it('reopens a completed task when the template adds a Sub-task to it', () => {
      const previous = run(true, subTasks(['short', true], ['long', true]));
      const result = reconcileRunSections(previous, template(subTasks(['short'], ['long'], ['tagline'])), []);
      const task = result.sections[0].items[0] as Json;

      expect(task.isCompleted).toBe(false);
      expect(allSubTasks(task).map((subItem) => [subItem.id, subItem.isCompleted]))
        .toEqual([['short', true], ['long', true], ['tagline', false]]);
      expect(calculateRunProgress(result.sections)).toBe(40);
    });

    it('reopens the task when the new Sub-task is in another Sub-tasks block', () => {
      const previous = run(true, subTasks(['short', true]));
      expect(reconciledTask(previous, template(subTasks(['short']), subTasks(['tagline']))).isCompleted).toBe(false);
    });

    it('completes a task when its only unfinished Sub-task is removed', () => {
      const previous = run(false, subTasks(['short', true], ['long', false]));
      expect(reconciledTask(previous, template(subTasks(['short']))).isCompleted).toBe(true);
    });

    it('keeps the run state of a task whose Sub-tasks are all removed', () => {
      expect(reconciledTask(run(true, subTasks(['short', true])), template()).isCompleted).toBe(true);
      expect(reconciledTask(run(false, subTasks(['short', false])), template()).isCompleted).toBe(false);
    });

    it('keeps legacy completed Sub-tasks complete', () => {
      const previous = run(true, [{ id: 'short', title: 'short', completed: true }]);
      const task = reconciledTask(previous, template(subTasks(['short'])));

      expect(task.isCompleted).toBe(true);
      expect(allSubTasks(task)[0].isCompleted).toBe(true);
    });

    it('never leaves a task complete with an unfinished Sub-task', () => {
      const evolutions: unknown[][] = [
        template(subTasks(['short'], ['long'])),
        template(subTasks(['long'], ['short'])),
        template(subTasks(['short'], ['long'], ['tagline'])),
        template(subTasks(['short'])),
        template(subTasks(['short']), subTasks(['long'])),
        [{ id: 's', title: 'S', items: [{ id: 'task', title: 'Write copy', subItems: subTasks(['short'], ['extra']) }] }],
      ];
      const previousRuns = [
        run(true, subTasks(['short', true], ['long', true])),
        run(true, subTasks(['short', true], ['long', false])),
        run(false, subTasks(['short', true], ['long', true])),
        run(false, subTasks(['short', false], ['long', false])),
      ];

      for (const previous of previousRuns) {
        for (const next of evolutions) {
          const task = reconciledTask(previous, next);
          const subItems = allSubTasks(task);
          if (subItems.length > 0) {
            expect(task.isCompleted).toBe(subItems.every((subItem) => subItem.isCompleted === true));
          }
        }
      }
    });
  });
});

describe('malformed Template content', () => {
  it('never copies a malformed Sub-task list or value into a run', () => {
    const previous = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', isCompleted: true, notes: 'Keep' }] }];
    const template = [{
      id: 's1',
      title: 'Launch',
      items: [{
        id: 'i1',
        title: 'Task',
        subItems: 'x',
        contents: [
          { type: 'subItems', value: '', subItems: 'x' },
          { type: 'subItems', value: '', subItems: { a: 1 } },
          { type: 'text', value: {} },
          { type: 'poll', value: 'x' },
          'x',
        ],
      }],
    }];

    const [item] = reconcileRunSections(previous, template, []).sections[0].items as Array<Record<string, unknown>>;

    expect(item.contents).toEqual([
      { type: 'subItems', value: '', subItems: [] },
      { type: 'subItems', value: '', subItems: [] },
      { type: 'text', value: '' },
    ]);
    expect(item.subItems).toEqual([]);
    expect(item).toEqual(expect.objectContaining({ isCompleted: true, notes: 'Keep' }));
  });
});

describe('retired run work', () => {
  const section = (items: unknown[]) => [{ id: 'section-1', title: 'Launch', items }];
  const dns = { id: 'item-dns', title: 'Check DNS', isCompleted: true, notes: 'TTL lowered to 300' };
  const copy = { id: 'item-copy', title: 'Write copy', isCompleted: false };

  it('reports only the work this reconcile retired', () => {
    const earlier = { kind: 'item', sectionId: 'section-1', item: { id: 'item-old', title: 'Old', notes: 'Earlier' } };
    const result = reconcileRunSections(section([dns, copy]), section([{ id: 'item-copy', title: 'Write copy' }]), [earlier]);

    expect(result.newlyRetired).toEqual([
      expect.objectContaining({ kind: 'item', item: expect.objectContaining({ id: 'item-dns', notes: 'TTL lowered to 300' }) }),
    ]);
    expect(result.retired).toEqual([earlier, ...result.newlyRetired]);
  });

  it('restores a retired task with its notes and completion when the Template brings its id back', () => {
    const removed = reconcileRunSections(section([dns, copy]), section([{ id: 'item-copy', title: 'Write copy' }]), []);
    const restored = reconcileRunSections(
      removed.sections,
      section([{ id: 'item-dns', title: 'Check DNS' }, { id: 'item-copy', title: 'Write copy' }]),
      removed.retired,
    );

    expect(restored.sections[0].items[0]).toEqual(expect.objectContaining({
      id: 'item-dns',
      isCompleted: true,
      notes: 'TTL lowered to 300',
    }));
    expect(restored.retired).toEqual([]);
    expect(restored.newlyRetired).toEqual([]);
  });

  it('restores retired sections and Sub-tasks by id', () => {
    const withSubTask = {
      id: 'item-copy',
      title: 'Write copy',
      contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-short', title: 'Short', isCompleted: true }] }],
    };
    const previousRetired = [
      { kind: 'section', section: { id: 'section-2', title: 'QA', items: [{ id: 'item-qa', title: 'Test', isCompleted: true, notes: 'Passed' }] } },
      { kind: 'subItem', sectionId: 'section-1', itemId: 'item-copy', subItem: { id: 'sub-long', title: 'Long', isCompleted: true } },
    ];
    const template = [
      {
        id: 'section-1',
        title: 'Launch',
        items: [{
          ...withSubTask,
          contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-short', title: 'Short' }, { id: 'sub-long', title: 'Long' }] }],
        }],
      },
      { id: 'section-2', title: 'QA', items: [{ id: 'item-qa', title: 'Test' }] },
    ];

    const result = reconcileRunSections(section([withSubTask]), template, previousRetired);

    expect(result.sections[0].items[0].contents[0].subItems).toEqual([
      { id: 'sub-short', title: 'Short', isCompleted: true },
      { id: 'sub-long', title: 'Long', isCompleted: true },
    ]);
    expect(result.sections[0].items[0].isCompleted).toBe(true);
    expect(result.sections[1].items[0]).toEqual(expect.objectContaining({ id: 'item-qa', isCompleted: true, notes: 'Passed' }));
    expect(result.retired).toEqual([]);
  });

  it('prefers the live copy and keeps a stale retired duplicate', () => {
    const stale = { kind: 'item', sectionId: 'section-1', item: { ...dns, notes: 'Stale' } };
    const result = reconcileRunSections(section([dns]), section([{ id: 'item-dns', title: 'Check DNS' }]), [stale]);

    expect(result.sections[0].items[0].notes).toBe('TTL lowered to 300');
    expect(result.retired).toEqual([stale]);
  });
});

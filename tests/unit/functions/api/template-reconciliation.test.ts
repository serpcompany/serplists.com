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

  it('never reports 100% while a task or sub-task is left, however large the run: 199 of 200 units is 99, not a rounded 100', () => {
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

  it('preserves legacy id-less progress on the first template evolution, reopening a task that gains an incomplete Sub-task', () => {
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
    const subTasksBlockRows = (item: Json): Json[] => (item.contents ?? [])
      .filter((content: Json) => content.type === 'subItems')
      .flatMap((content: Json) => content.subItems ?? []);

    it('reopens a completed task when the template adds a Sub-task to it', () => {
      const previous = run(true, subTasks(['short', true], ['long', true]));
      const result = reconcileRunSections(previous, template(subTasks(['short'], ['long'], ['tagline'])), []);
      const task = result.sections[0].items[0] as Json;

      expect(task.isCompleted).toBe(false);
      expect(subTasksBlockRows(task).map((subItem) => [subItem.id, subItem.isCompleted]))
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
      expect(subTasksBlockRows(task)[0].isCompleted).toBe(true);
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
          const subItems = subTasksBlockRows(task);
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

describe('work that moves to another section or task, which keeps its run state since ids are unique across the Template', () => {
  const x = { id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' };
  const y = { id: 'y', title: 'Draft brief', isCompleted: false };
  const z = { id: 'z', title: 'Publish', isCompleted: true, notes: 'live' };
  const previous = [
    { id: 'A', title: 'Plan', items: [x, y] },
    { id: 'B', title: 'Ship', items: [z] },
  ];
  const fresh = ({ id, title }: { id: string; title: string }) => ({ id, title });

  it('keeps the state of a task moved to a later section and retires nothing', () => {
    const result = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] },
    ], []);

    expect(result.sections[1].items[1]).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(result.sections[1].items[0]).toEqual(expect.objectContaining({ id: 'z', isCompleted: true, notes: 'live' }));
    expect(result.retired).toEqual([]);
    expect(result.newlyRetired).toEqual([]);
    expect(calculateRunProgress(result.sections)).toBe(calculateRunProgress(previous));
  });

  it('keeps the state of a task moved to an earlier section', () => {
    const result = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(z), fresh(x), fresh(y)] },
      { id: 'B', title: 'Ship', items: [] },
    ], []);

    expect(result.sections[0].items[0]).toEqual(expect.objectContaining({ id: 'z', isCompleted: true, notes: 'live' }));
    expect(result.retired).toEqual([]);
  });

  it('leaves a moved task out of the section it left when that section is removed', () => {
    const result = reconcileRunSections(previous, [{ id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] }], []);

    expect(result.sections[0].items[1]).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(result.newlyRetired).toEqual([{ kind: 'section', section: { id: 'A', title: 'Plan', items: [y] } }]);
  });

  it('retires nothing for a removed section whose tasks all moved', () => {
    const result = reconcileRunSections(previous, [{ id: 'B', title: 'Ship', items: [fresh(x), fresh(z), fresh(y)] }], []);

    expect(result.sections[0].items.map((item) => [item.id, item.isCompleted])).toEqual([['x', true], ['z', true], ['y', false]]);
    expect(result.retired).toEqual([]);
  });

  it('never brings back a stale retired copy when the task moves back', () => {
    const moved = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] },
    ], []);
    const untickedAndNotedAgainInItsNewSection = structuredClone(moved.sections);
    untickedAndNotedAgainInItsNewSection[1].items[1] = { ...untickedAndNotedAgainInItsNewSection[1].items[1], isCompleted: false, notes: 'vendor called back' };
    const stale = { kind: 'item', sectionId: 'A', item: x };

    const back = reconcileRunSections(untickedAndNotedAgainInItsNewSection, [
      { id: 'A', title: 'Plan', items: [fresh(x), fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z)] },
    ], [stale]);

    expect(back.sections[0].items[0]).toEqual(expect.objectContaining({ id: 'x', isCompleted: false, notes: 'vendor called back' }));
    expect(back.newlyRetired).toEqual([]);
  });

  describe('Sub-tasks', () => {
    const subTasks = (...list: Array<Record<string, unknown>>) => [{ type: 'subItems', value: '', subItems: list }];
    const s1 = { id: 's1', title: 'Quote', isCompleted: true };
    const s2 = { id: 's2', title: 'Invoice', isCompleted: false };
    const withSubTasks = [
      { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', isCompleted: false, contents: subTasks(s1, s2) }] },
      { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', isCompleted: false, subItems: [{ id: 's3', title: 'Pay', isCompleted: false }] }] },
    ];
    const bare = ({ id, title }: { id: string; title: string }) => ({ id, title });

    it('keeps the state of a Sub-task moved to a task in another section', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', contents: subTasks(bare(s2)) }] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s1)) }] },
      ], []);

      expect(result.sections[1].items[0].contents[0].subItems).toEqual([{ id: 's1', title: 'Quote', isCompleted: true }]);
      expect(result.sections[0].items[0].contents[0].subItems).toEqual([{ id: 's2', title: 'Invoice', isCompleted: false }]);
      expect(result.retired).toEqual([]);
    });

    it('completes the task it moved out of when only finished Sub-tasks are left there', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', contents: subTasks(bare(s1)) }] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s2)) }] },
      ], []);

      expect(result.sections[0].items[0].isCompleted).toBe(true);
      expect(result.sections[1].items[0].contents[0].subItems[0]).toEqual({ id: 's2', title: 'Invoice', isCompleted: false });
      expect(result.retired).toEqual([]);
    });

    it('leaves a moved Sub-task out of the task it left when that task is removed', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s1)) }] },
      ], []);

      expect(result.sections[1].items[0].contents[0].subItems[0]).toEqual({ id: 's1', title: 'Quote', isCompleted: true });
      expect(result.newlyRetired).toEqual([{
        kind: 'item',
        sectionId: 'A',
        sectionTitle: 'Plan',
        item: { id: 'p', title: 'Buy', isCompleted: false, contents: subTasks(s2) },
      }]);
    });
  });

  describe('ids a legacy run from before ids were unique across the Template repeats in several sections', () => {
    const legacy = [
      { id: 'A', title: 'Plan', items: [{ id: '1', title: 'First', isCompleted: true, notes: 'a' }] },
      { id: 'B', title: 'Ship', items: [{ id: '1', title: 'First', isCompleted: false, notes: 'b' }] },
    ];

    it('still matches each copy in its own section', () => {
      const result = reconcileRunSections(legacy, [
        { id: 'A', title: 'Plan', items: [{ id: '1', title: 'First' }] },
        { id: 'B', title: 'Ship', items: [{ id: '1', title: 'First' }] },
      ], []);

      expect(result.sections.map((section) => section.items[0].notes)).toEqual(['a', 'b']);
      expect(result.retired).toEqual([]);
    });

    it('retires the copy of a removed section instead of moving it', () => {
      const result = reconcileRunSections(legacy, [{ id: 'B', title: 'Ship', items: [{ id: '1', title: 'First' }] }], []);

      expect(result.sections[0].items[0]).toEqual(expect.objectContaining({ notes: 'b', isCompleted: false }));
      expect(result.newlyRetired).toEqual([{ kind: 'section', section: legacy[0] }]);
    });

    it('never guesses which copy moved to another section', () => {
      const result = reconcileRunSections(legacy, [{ id: 'C', title: 'Later', items: [{ id: '1', title: 'First' }] }], []);

      expect(result.sections[0].items[0]).toEqual({ id: '1', title: 'First', isCompleted: false });
      expect(result.newlyRetired).toHaveLength(2);
    });
  });

  it('keeps every task and Sub-task state when ids are only rearranged between parents, a task with Sub-tasks being complete exactly when they are', () => {
    const subTaskBlock = (...list: Array<[string, boolean]>) =>
      [{ type: 'subItems', value: '', subItems: list.map(([id, isCompleted]) => ({ id, title: id, isCompleted })) }];
    const run = [
      { id: 'A', title: 'A', items: [
        { id: 'a1', title: 'a1', isCompleted: true, notes: 'n-a1', contents: subTaskBlock(['u1', true], ['u2', false]) },
        { id: 'a2', title: 'a2', isCompleted: false, notes: 'n-a2' },
      ] },
      { id: 'B', title: 'B', items: [
        { id: 'b1', title: 'b1', isCompleted: false, contents: subTaskBlock(['u3', true]) },
        { id: 'b2', title: 'b2', isCompleted: true, notes: 'n-b2' },
      ] },
      { id: 'C', title: 'C', items: [{ id: 'c1', title: 'c1', isCompleted: true }] },
    ];
    type Entry = { id: string; isCompleted?: unknown; notes?: unknown; contents?: Array<{ subItems?: Entry[] }> };
    const notesAndOwnCompletionById = (sections: Array<{ items: Entry[] }>) => new Map(sections.flatMap((section) => section.items.flatMap((item) => {
      const subItems = (item.contents ?? []).flatMap((content) => content.subItems ?? []);
      return [
        [item.id, { notes: item.notes, ...(subItems.length > 0 ? {} : { isCompleted: item.isCompleted }) }],
        ...subItems.map((subItem) => [subItem.id, { isCompleted: subItem.isCompleted }]),
      ] as Array<[string, Record<string, unknown>]>;
    })));
    const layout = (sections: Record<string, Record<string, string[]>>) => Object.entries(sections).map(([sectionId, items]) => ({
      id: sectionId,
      title: sectionId,
      items: Object.entries(items).map(([itemId, subIds]) => ({
        id: itemId,
        title: itemId,
        ...(subIds.length > 0 ? { contents: [{ type: 'subItems', value: '', subItems: subIds.map((id) => ({ id, title: id })) }] } : {}),
      })),
    }));
    const before = notesAndOwnCompletionById(run);

    for (const rearranged of [
      { C: { b2: [], a1: ['u3'] }, A: { c1: ['u2', 'u1'], a2: [] }, B: { b1: [] } },
      { B: { a2: ['u1', 'u2', 'u3'], b1: [], b2: [] }, A: { c1: [], a1: [] }, C: {} },
      { A: { b1: ['u2'], a1: ['u1'] }, B: {}, C: { c1: ['u3'], a2: [], b2: [] } },
    ]) {
      const result = reconcileRunSections(run, layout(rearranged), []);
      for (const [id, after] of notesAndOwnCompletionById(result.sections as Array<{ items: Entry[] }>)) {
        const had = before.get(id)!;
        expect(after.notes, id).toBe(had.notes);
        if ('isCompleted' in after && 'isCompleted' in had) expect(after.isCompleted, id).toBe(had.isCompleted);
      }
      expect(result.retired).toEqual([]);
    }
  });
});

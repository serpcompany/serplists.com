import { describe, expect, it } from 'vitest';
import { contentAt, firstOf, taskIn } from '../../../support/elements';

import {
  calculateRunProgress,
  reconcileRunSections,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';
import { sectionsOf } from '../../../support/reconciledSections';
import { objectContaining } from '../../../support/asymmetricMatchers';

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

    expect(firstOf(sectionsOf(result)).title).toBe('Launch content');
    expect(firstOf(sectionsOf(result)).items.map((item) => item.id)).toEqual([
      'item-media',
      'item-copy',
    ]);
    expect(taskIn(sectionsOf(result), 0, 0).isCompleted).toBe(false);
    expect(taskIn(sectionsOf(result), 0, 1)).toMatchObject({
      id: 'item-copy',
      title: 'Write listing copy',
      description: 'New instructions',
      isCompleted: false,
      notes: 'Approved by Devin',
    });
    expect(contentAt(taskIn(sectionsOf(result), 0, 1), 0).subItems).toEqual([
      { id: 'sub-long', title: 'Full description', isCompleted: false },
      { id: 'sub-tagline', title: 'Tagline', isCompleted: false },
      { id: 'sub-short', title: 'Short copy', isCompleted: true },
    ]);
    expect(result.retired).toEqual([
      objectContaining({
        kind: 'item',
        sectionId: 'section-content',
        item: objectContaining({ id: 'item-retired', notes: 'Kept for audit history' }),
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
      objectContaining({ kind: 'subItem', subItem: objectContaining({ id: 'sub-long' }) }),
      objectContaining({ kind: 'item', item: objectContaining({ id: 'item-retired' }) }),
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

    expect(sectionsOf(result)[0]).toMatchObject({ id: 'legacy-section-1', title: 'Renamed content section' });
    expect(taskIn(sectionsOf(result), 0, 0)).toMatchObject({
      id: 'legacy-item-1-1',
      title: 'Renamed copy task',
      isCompleted: false,
      notes: 'Legacy note',
    });
    expect(contentAt(taskIn(sectionsOf(result), 0, 0), 0).subItems).toEqual([
      objectContaining({ id: 'legacy-subitem-1-1-1', isCompleted: true }),
      objectContaining({ id: 'legacy-subitem-1-1-2', isCompleted: false }),
    ]);
    expect(taskIn(sectionsOf(result), 0, 1)).toMatchObject({
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
      objectContaining({
        id: '1',
        items: [
          objectContaining({
            id: 'legacy-item-1-1',
            title: 'Publish renamed listing',
            isCompleted: true,
            notes: 'Submitted copy is approved',
          }),
          objectContaining({
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
      taskIn(sectionsOf(reconcileRunSections(previous, next, [])), 0, 0);
    const subTasksBlockRows = (item: Json): Json[] => (item.contents ?? [])
      .filter((content: Json) => content.type === 'subItems')
      .flatMap((content: Json) => content.subItems ?? []);

    it('reopens a completed task when the template adds a Sub-task to it', () => {
      const previous = run(true, subTasks(['short', true], ['long', true]));
      const result = reconcileRunSections(previous, template(subTasks(['short'], ['long'], ['tagline'])), []);
      const task: Json = taskIn(sectionsOf(result), 0, 0);

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
      expect(firstOf(subTasksBlockRows(task)).isCompleted).toBe(true);
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

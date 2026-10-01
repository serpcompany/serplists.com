import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { calculateRunProgress } from '@functions/api/utils/template-reconciliation';
import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import { toProgressPercent } from '@/lib/progress';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun, ChecklistSection } from '@/types/checklist';

const TASKS = 40;
const SUB_TASKS_PER_TASK = 4;

const sectionsWithOneOf200UnitsOpen = (): ChecklistSection[] => [
  {
    id: 'section-1',
    title: 'Launch',
    items: Array.from({ length: TASKS }, (_, itemIndex) => ({
      id: `item-${itemIndex}`,
      title: `Task ${itemIndex}`,
      isCompleted: true,
      contents: [
        {
          type: 'subItems' as const,
          value: '',
          subItems: Array.from({ length: SUB_TASKS_PER_TASK }, (_, subIndex) => ({
            id: `sub-${itemIndex}-${subIndex}`,
            title: `Step ${subIndex}`,
            isCompleted: !(itemIndex === TASKS - 1 && subIndex === SUB_TASKS_PER_TASK - 1),
          })),
        },
      ],
    })),
  },
];

describe('toProgressPercent', () => {
  it.each([
    [0, 0, 0],
    [0, 5, 0],
    [5, 5, 100],
    [1, 3, 33],
    [2, 3, 67],
    [3, 5, 60],
    [199, 200, 99],
    [200, 201, 99],
    [398, 400, 99],
    [999, 1000, 99],
    [1, 201, 1],
    [1, 300, 1],
  ])('%i of %i is %i%%', (completed, total, expected) => {
    expect(toProgressPercent(completed, total)).toBe(expected);
  });

  it('is 100 only when everything is done and 0 only when nothing is', () => {
    for (let total = 1; total <= 1000; total += 1) {
      for (let completed = 0; completed <= total; completed += 1) {
        const percent = toProgressPercent(completed, total);
        if (
          !Number.isInteger(percent) ||
          (percent === 100) !== (completed === total) ||
          (percent === 0) !== (completed === 0)
        ) {
          throw new Error(`${completed} of ${total} gave ${percent}%`);
        }
      }
    }
  });

  it('stays in range for inputs the counters never produce', () => {
    expect(toProgressPercent(7, 5)).toBe(100);
    expect(toProgressPercent(-1, 5)).toBe(0);
    expect(toProgressPercent(1, Number.NaN)).toBe(0);
    expect(toProgressPercent(Number.NaN, 5)).toBe(0);
  });
});

describe('run progress on large runs, where one open unit in 200 must not round to 100', () => {
  it('is 99 in every calculator when one of 200 units is left', () => {
    const sections = sectionsWithOneOf200UnitsOpen();
    const run = { id: 'run-1', sections } as unknown as ChecklistRun;

    expect(calculateSectionsProgress(sections)).toBe(99);
    expect(countRunExecutionItems(run)).toEqual({
      progress: 99,
      subTasksCompleted: 159,
      subTasksTotal: 160,
      tasksCompleted: 40,
      tasksTotal: 40,
    });
    expect(calculateRunProgress(sections)).toBe(99);
  });

  it('agrees between the client and the server', () => {
    const sections = sectionsWithOneOf200UnitsOpen();
    const items = sections[0].items;
    for (let done = 0; done <= items.length; done += 1) {
      const partial = [{ ...sections[0], items: items.map((item, index) => ({ ...item, isCompleted: index < done })) }];
      expect(calculateRunProgress(partial)).toBe(calculateSectionsProgress(partial));
    }
  });

  it('has no inline percentage left outside src/lib/progress.ts', () => {
    const files = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const file = path.join(directory, entry);
        return statSync(file).isDirectory() ? files(file) : /\.tsx?$/.test(entry) ? [file] : [];
      });
    const offenders = [...files('src'), ...files('functions')].filter(
      (file) =>
        path.normalize(file) !== path.normalize('src/lib/progress.ts') &&
        /Math\.round\(\s*\(?\s*completed\s*\/\s*total/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { calculateRunProgress } from '@functions/api/utils/template-reconciliation';
import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import { toProgressPercent } from '@/lib/progress';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun, ChecklistSection } from '@/types/checklist';

// Every progress figure was Math.round(completed / total * 100). With 200 or more tasks
// and sub-tasks, one unchecked one is 99.5%, which rounded to 100: the dashboard showed
// "100% complete" and a full bar for a run with work left, and the stored progress that
// MCP agents read was 100. The client and the server now share one rule.

// 40 tasks, each with a 4-item Sub-tasks block: 200 units. Everything is done except one sub-task.
const nearlyDoneSections = (): ChecklistSection[] => [
  {
    id: 'section-1',
    title: 'Launch',
    items: Array.from({ length: 40 }, (_, itemIndex) => ({
      id: `item-${itemIndex}`,
      title: `Task ${itemIndex}`,
      isCompleted: true,
      contents: [
        {
          type: 'subItems' as const,
          value: '',
          subItems: Array.from({ length: 4 }, (_, subIndex) => ({
            id: `sub-${itemIndex}-${subIndex}`,
            title: `Step ${subIndex}`,
            isCompleted: !(itemIndex === 39 && subIndex === 3),
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

describe('run progress on large runs', () => {
  it('is 99 in every calculator when one of 200 units is left', () => {
    const sections = nearlyDoneSections();
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
    const sections = nearlyDoneSections();
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

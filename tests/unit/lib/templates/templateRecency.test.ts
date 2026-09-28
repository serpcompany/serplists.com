import { describe, expect, it } from 'vitest';

import {
  compareTemplatesByRecent,
  getTemplateRecencyTime,
} from '@/lib/templates/templateRecency';

type RecencyFixture = {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
};

const fixture = (
  id: string,
  createdAt: string,
  updatedAt: string,
): RecencyFixture => ({ createdAt, id, title: id, updatedAt });

const permutations = <T,>(items: T[]): T[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
          (rest) => [item, ...rest],
        ),
      );

describe('getTemplateRecencyTime', () => {
  it('uses the last edit, or creation for a never-edited template', () => {
    expect(
      getTemplateRecencyTime(fixture('a', '2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z')),
    ).toBe(Date.parse('2026-09-20T00:00:00.000Z'));
    expect(getTemplateRecencyTime(fixture('n', '2026-09-10T00:00:00.000Z', ''))).toBe(
      Date.parse('2026-09-10T00:00:00.000Z'),
    );
  });

  it('falls back to creation for an unparseable edit date and to 0 when both are unknown', () => {
    expect(getTemplateRecencyTime(fixture('g', '2026-09-10T00:00:00.000Z', 'garbage'))).toBe(
      Date.parse('2026-09-10T00:00:00.000Z'),
    );
    expect(getTemplateRecencyTime(fixture('x', '', ''))).toBe(0);
    expect(getTemplateRecencyTime(fixture('y', 'garbage', 'garbage'))).toBe(0);
  });

  it('reads SQLite datetime text as UTC', () => {
    expect(getTemplateRecencyTime(fixture('s', '2026-09-10 12:30:00', ''))).toBe(
      Date.parse('2026-09-10T12:30:00.000Z'),
    );
  });
});

describe('compareTemplatesByRecent', () => {
  const neverEditedOld = fixture('n1', '2026-08-01T00:00:00.000Z', '');
  const editedOld = fixture('a', '2026-07-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
  const imported = fixture('n2', '2026-09-10T00:00:00.000Z', '');
  const editedNew = fixture('b', '2026-06-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z');

  it('puts the most recent activity first whatever the input order', () => {
    const orders = permutations([neverEditedOld, editedOld, imported, editedNew]).map((items) =>
      [...items].sort(compareTemplatesByRecent).map((item) => item.id),
    );

    for (const order of orders) {
      expect(order).toEqual(['b', 'n2', 'a', 'n1']);
    }
  });

  it('never returns NaN and gives a total order for empty, invalid and equal dates', () => {
    const values = ['2026-09-20T00:00:00.000Z', '', 'garbage'];
    const items = values.flatMap((updatedAt, updatedIndex) =>
      values.map((createdAt, createdIndex) =>
        fixture(`t-${updatedIndex}-${createdIndex}`, createdAt, updatedAt),
      ),
    );

    for (const left of items) {
      for (const right of items) {
        const result = compareTemplatesByRecent(left, right);
        const reverse = compareTemplatesByRecent(right, left);
        expect(Number.isNaN(result)).toBe(false);
        expect(Math.sign(result) + Math.sign(reverse) === 0).toBe(true);
        if (left !== right) {
          expect(result).not.toBe(0);
        }
      }
    }
  });
});

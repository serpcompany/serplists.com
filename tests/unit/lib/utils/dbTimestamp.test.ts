import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  formatLocalDate,
  formatLocalDateTime,
  formatMonthYear,
  normalizeDbTimestamp,
  parseDbTimestamp,
  toEcmaDateTimeString,
} from '@/lib/utils/dbTimestamp';

// The ECMAScript date time string format: the only form every engine (Safari too) must parse.
const SPEC_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

// Node reads a bare 'YYYY-MM-DD HH:MM:SS' as local time; a zone far from UTC exposes that.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Tokyo';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('parseDbTimestamp', () => {
  it('reads a D1 CURRENT_TIMESTAMP value as UTC', () => {
    expect(parseDbTimestamp('2025-12-26 09:18:30')?.toISOString()).toBe(
      '2025-12-26T09:18:30.000Z',
    );
    expect(parseDbTimestamp(' 2025-12-26 09:18:30.25 ')?.toISOString()).toBe(
      '2025-12-26T09:18:30.250Z',
    );
  });

  it('keeps ISO values with a zone as they are', () => {
    expect(parseDbTimestamp('2025-12-26T09:18:30.000Z')?.toISOString()).toBe(
      '2025-12-26T09:18:30.000Z',
    );
    expect(parseDbTimestamp('2025-12-26T09:18:30+02:00')?.toISOString()).toBe(
      '2025-12-26T07:18:30.000Z',
    );
    expect(parseDbTimestamp('2025-12-26')?.toISOString()).toBe('2025-12-26T00:00:00.000Z');
  });

  it('accepts epoch milliseconds', () => {
    const epoch = Date.UTC(2025, 11, 26, 9, 18, 30);

    expect(parseDbTimestamp(epoch)?.getTime()).toBe(epoch);
    expect(parseDbTimestamp(String(epoch))?.getTime()).toBe(epoch);
  });

  it.each([null, undefined, '', '   ', 'garbage', '2025-13-45 99:99:99', {}, Number.NaN])(
    'returns null for %s',
    (value) => {
      expect(parseDbTimestamp(value)).toBeNull();
    },
  );
});

describe('toEcmaDateTimeString', () => {
  it.each([
    '2025-12-26 09:18:30',
    '2025-12-26 09:18:30.5',
    '2025-12-26 09:18',
    '2025-12-26T09:18:30',
    '2025-12-26T09:18:30.123456Z',
    '2025-12-26T09:18:30.000Z',
    '2025-12-26T09:18:30-05:00',
    '2025-12-26',
  ])('hands the engine only the spec format for %s', (value) => {
    expect(toEcmaDateTimeString(value)).toMatch(SPEC_FORMAT);
  });

  it('never adds a second zone', () => {
    expect(toEcmaDateTimeString('2025-12-26T09:18:30.000Z')).toBe('2025-12-26T09:18:30.000Z');
  });

  it('refuses forms whose parsing differs between engines', () => {
    expect(toEcmaDateTimeString('12/26/2025 09:18:30')).toBeNull();
    expect(toEcmaDateTimeString('Fri, 26 Dec 2025 09:18:30 GMT')).toBeNull();
  });
});

describe('normalizeDbTimestamp', () => {
  it('returns an ISO string in UTC, or null', () => {
    expect(normalizeDbTimestamp('2025-12-26 09:18:30')).toBe('2025-12-26T09:18:30.000Z');
    expect(normalizeDbTimestamp('garbage')).toBeNull();
  });
});

describe('formatMonthYear', () => {
  it('formats a D1 timestamp as its month and year', () => {
    expect(formatMonthYear('2025-12-26 09:18:30')).toBe('December 2025');
  });

  it('uses the UTC month for a value on a month boundary', () => {
    expect(formatMonthYear('2025-11-30 20:00:00')).toBe('November 2025');
  });

  it('returns null instead of "Invalid Date"', () => {
    expect(formatMonthYear('not a date')).toBeNull();
    expect(formatMonthYear(null)).toBeNull();
  });
});

// Some ICU versions put a narrow no-break space before AM/PM.
const plainSpaces = (value: string) => value.replace(/\s/g, ' ');

describe('formatLocalDate and formatLocalDateTime', () => {
  it('shows a zoneless database timestamp as UTC in the viewer zone', () => {
    // 20:30 UTC on July 5 is 05:30 on July 6 in Tokyo.
    expect(formatLocalDate('2026-07-05 20:30:00')).toBe('7/6/2026');
    expect(plainSpaces(formatLocalDateTime('2026-07-05 20:30:00'))).toBe('Jul 6, 2026, 5:30 AM');
    expect(plainSpaces(formatLocalDateTime('2026-07-05T20:30:00.000Z'))).toBe(
      'Jul 6, 2026, 5:30 AM',
    );
  });

  it.each([undefined, null, '', 'not a timestamp'])('shows nothing for %s', (value) => {
    expect(formatLocalDate(value)).toBe('');
    expect(formatLocalDateTime(value)).toBe('');
  });
});

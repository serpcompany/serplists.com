import { describe, expect, it } from 'vitest';
import { parseRangeHeader, resolveByteRange } from '@functions/api/utils/r2-file-response';

describe('parseRangeHeader', () => {
  it.each([
    [null, { kind: 'full' }],
    ['bytes=0-1', { kind: 'partial', range: { offset: 0, length: 2 } }],
    ['bytes=0-', { kind: 'partial', range: { offset: 0 } }],
    ['BYTES=10-19', { kind: 'partial', range: { offset: 10, length: 10 } }],
    ['bytes=-500', { kind: 'partial', range: { suffix: 500 } }],
    ['bytes=-0', { kind: 'unsatisfiable' }],
    ['bytes=0-1,4-5', { kind: 'full' }],
    ['bytes=5-2', { kind: 'full' }],
    ['bytes=-', { kind: 'full' }],
    ['items=0-1', { kind: 'full' }],
    ['bytes=99999999999999999999-', { kind: 'full' }],
  ])('%s -> %j', (header, expected) => {
    expect(parseRangeHeader(header)).toEqual(expected);
  });
});

describe('resolveByteRange', () => {
  it.each([
    [{ offset: 0, length: 2 }, 100, { start: 0, end: 1 }],
    [{ offset: 95 }, 100, { start: 95, end: 99 }],
    [{ length: 10 }, 100, { start: 0, end: 9 }],
    [{ offset: 98, length: 500 }, 100, { start: 98, end: 99 }],
    [{ suffix: 3 }, 100, { start: 97, end: 99 }],
    [{ suffix: 500 }, 100, { start: 0, end: 99 }],
    [{ offset: 100 }, 100, null],
    [{ offset: 0 }, 0, null],
    [{ suffix: 5 }, 0, null],
  ])('%j of %d bytes -> %j', (range, size, expected) => {
    expect(resolveByteRange(range as R2Range, size)).toEqual(expected);
  });

  it.each([
    [{ offset: 0, length: 2, suffix: undefined }, 64, { start: 0, end: 1 }],
    [{ offset: 60, length: undefined, suffix: undefined }, 64, { start: 60, end: 63 }],
    [{ offset: undefined, length: undefined, suffix: 3 }, 64, { start: 61, end: 63 }],
  ])('reads %j of %d bytes, as workerd\'s local R2 reports it with the unused fields undefined, as %j', (range, size, expected) => {
    expect(resolveByteRange(range as unknown as R2Range, size)).toEqual(expected);
  });
});

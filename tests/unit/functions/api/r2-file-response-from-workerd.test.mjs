import { describe, expect, it } from 'vitest';

import { resolveByteRange } from '../../../../functions/api/utils/r2-file-response';

describe('resolveByteRange on the range workerd reports, which R2Range types rule out', () => {
  it.each([
    [{ offset: 0, length: 2, suffix: undefined }, 64, { start: 0, end: 1 }],
    [{ offset: 60, length: undefined, suffix: undefined }, 64, { start: 60, end: 63 }],
    [{ offset: undefined, length: undefined, suffix: 3 }, 64, { start: 61, end: 63 }],
  ])("reads %j of %d bytes, as workerd's local R2 reports it with the unused fields undefined, as %j", (range, size, expected) => {
    expect(resolveByteRange(range, size)).toEqual(expected);
  });
});

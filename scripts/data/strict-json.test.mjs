import { describe, expect, it } from 'vitest';
import { parseStrictJson, parseExactJson, DuplicateJsonKeyError, InexactJsonNumberError } from './strict-json-lib.mjs';

describe('exact JSON evidence parsing', () => {
  it('accepts mathematically equivalent notation while preserving JSON types', () => {
    expect(parseExactJson('[1.0,1e0,5e-1,100e-1,9007199254740992.0,"1",0e999999999999999999]'))
      .toEqual([1, 1, 0.5, 10, 9007199254740992, '1', 0]);
  });
  it.each(['1e-400', '-1e-400', '1e400', '9007199254740993', '0.10000000000000001', '-0'])('rejects inexact token %s without private diagnostics', token => {
    expect(() => parseExactJson(`{"private-key":${token}}`)).toThrow(InexactJsonNumberError);
    try { parseExactJson(`{"private-key":${token}}`); }
    catch (error) { expect(error.message).toBe('Unsupported JSON numeric value.'); }
  });
  it('rejects decoded duplicate keys before numeric conversion', () => {
    for (const parse of [parseStrictJson, parseExactJson]) {
      expect(() => parse(String.raw`{"count":1e-400,"\u0063ount":0}`)).toThrow(DuplicateJsonKeyError);
      expect(parse('{"a":{"id":1},"b":{"id":2}}')).toEqual({a:{id:1},b:{id:2}});
    }
  });
  it('preserves the existing strict parser reviver contract', () => {
    expect(parseStrictJson('1e-400')).toBe(0);
    expect(parseStrictJson('1e-400', (_name, _value, context) => context.source)).toBe('1e-400');
  });
});

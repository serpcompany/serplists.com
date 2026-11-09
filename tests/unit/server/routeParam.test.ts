import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { routeParam, routeQuery } from '@/server/routeParam';

describe('routeParam', () => {
  it('decodes a percent-encoded segment', () => {
    expect(routeParam('caf%C3%A9-launch')).toBe('café-launch');
  });

  it('keeps a segment with a malformed escape as it came, instead of failing the page', () => {
    expect(routeParam('100%-done')).toBe('100%-done');
  });
});

describe('routeQuery', () => {
  it('rebuilds the query string with every value of a repeated parameter and leaves out absent ones', () => {
    expect(routeQuery({ utm_source: 'news', tag: ['a', 'b'], ref: undefined })).toBe('?utm_source=news&tag=a&tag=b');
  });

  it('is empty when there is no query', () => {
    expect(routeQuery({})).toBe('');
    expect(routeQuery({ ref: undefined })).toBe('');
  });
});

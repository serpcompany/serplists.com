import { describe, expect, it } from 'vitest';

import { getListQueryStatus, hasListRefreshError } from '@/lib/queryState';

describe('getListQueryStatus', () => {
  it('reports loading only while a first load is in flight', () => {
    expect(getListQueryStatus({ data: undefined, isError: false, isLoading: true })).toBe('loading');
  });

  it('reports an error, not an empty list, when the first load failed', () => {
    expect(getListQueryStatus({ data: undefined, isError: true, isLoading: false })).toBe('error');
  });

  it('reports idle for a disabled or cancelled query with no data', () => {
    expect(getListQueryStatus({ data: undefined, isError: false, isLoading: false })).toBe('idle');
  });

  it('reports empty only for a loaded empty list', () => {
    expect(getListQueryStatus({ data: [], isError: false, isLoading: false })).toBe('empty');
  });

  it('keeps showing loaded data when a background refresh fails', () => {
    const query = { data: ['key-1'], isError: true, isLoading: false };

    expect(getListQueryStatus(query)).toBe('ready');
    expect(hasListRefreshError(query)).toBe(true);
    expect(hasListRefreshError({ data: undefined, isError: true, isLoading: false })).toBe(false);
    expect(hasListRefreshError({ data: ['key-1'], isError: false, isLoading: false })).toBe(false);
  });
});

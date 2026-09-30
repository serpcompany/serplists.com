import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUN_KEY_PERMISSIONS,
  parseStoredRunKeyPermissions,
  toggleRunKeyPermission,
  withImpliedRunKeyPermissions,
} from '@/lib/schemas/runKeyPermissions';

describe('Run Key permissions', () => {
  it('adds the read that each write implies and keeps a stable order', () => {
    expect(withImpliedRunKeyPermissions(['runs:write', 'templates:write'])).toEqual([
      'templates:read',
      'templates:write',
      'runs:read',
      'runs:write',
    ]);
  });

  it('defaults to what keys could do before template writes existed', () => {
    expect(DEFAULT_RUN_KEY_PERMISSIONS).toEqual(['templates:read', 'runs:read', 'runs:write']);
  });

  it('turns on the implied read and turns off writes that depend on a removed read', () => {
    expect(toggleRunKeyPermission(['runs:read'], 'templates:write', true)).toEqual([
      'templates:read',
      'templates:write',
      'runs:read',
    ]);
    expect(toggleRunKeyPermission(['templates:read', 'templates:write', 'runs:read'], 'templates:read', false))
      .toEqual(['runs:read']);
    expect(toggleRunKeyPermission(['templates:read', 'templates:write'], 'templates:write', false))
      .toEqual(['templates:read']);
  });

  it('grants nothing for malformed stored values and drops unknown entries', () => {
    expect(parseStoredRunKeyPermissions('not json')).toEqual([]);
    expect(parseStoredRunKeyPermissions('{"runs:read":true}')).toEqual([]);
    expect(parseStoredRunKeyPermissions(null)).toEqual([]);
    expect(parseStoredRunKeyPermissions('["templates:delete","runs:write"]')).toEqual(['runs:read', 'runs:write']);
  });
});

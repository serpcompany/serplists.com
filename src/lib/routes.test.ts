import { describe, expect, it } from 'vitest';

import {
  buildPublicTemplatesPath,
  isPublicTemplatesDiscoveryPath,
  resolveConsoleSection,
  resolveRouteShell,
} from '@/lib/routes';

describe('route helpers', () => {
  it('treats the public templates route as a discovery surface', () => {
    expect(isPublicTemplatesDiscoveryPath(buildPublicTemplatesPath())).toBe(true);
    expect(isPublicTemplatesDiscoveryPath('/templates/')).toBe(true);
    expect(isPublicTemplatesDiscoveryPath('/categories/launch')).toBe(false);
  });

  it('treats canonical private run routes as console surfaces', () => {
    expect(resolveRouteShell('/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc')).toBe(
      'console',
    );
    expect(resolveConsoleSection('/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc')).toBe(
      'runs',
    );
    expect(resolveRouteShell('/share/abc123')).toBe('public');
  });
});

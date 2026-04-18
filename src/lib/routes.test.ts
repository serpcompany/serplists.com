import { describe, expect, it } from 'vitest';

import {
  buildPublicTemplatesPath,
  isPublicTemplatesDiscoveryPath,
} from '@/lib/routes';

describe('route helpers', () => {
  it('treats the public templates route as a discovery surface', () => {
    expect(isPublicTemplatesDiscoveryPath(buildPublicTemplatesPath())).toBe(true);
    expect(isPublicTemplatesDiscoveryPath('/templates/')).toBe(true);
    expect(isPublicTemplatesDiscoveryPath('/categories/launch')).toBe(false);
  });
});

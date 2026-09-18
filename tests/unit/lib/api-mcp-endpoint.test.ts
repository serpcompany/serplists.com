import { describe, expect, it } from 'vitest';

import { getAgentMcpEndpoint } from '@/lib/api';

describe('getAgentMcpEndpoint', () => {
  it('uses the configured development API origin instead of the frontend origin', () => {
    expect(getAgentMcpEndpoint('http://localhost:8080')).toBe('http://localhost:8788/api/mcp');
  });
});

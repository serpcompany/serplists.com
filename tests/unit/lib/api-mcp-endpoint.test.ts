import { describe, expect, it } from 'vitest';

import { getAgentMcpEndpoint } from '@/lib/api';

describe('getAgentMcpEndpoint', () => {
  it("names the MCP endpoint on the page's own origin, where the API runs", () => {
    expect(getAgentMcpEndpoint('http://localhost:3000')).toBe('http://localhost:3000/api/mcp');
    expect(getAgentMcpEndpoint('https://staging.serplists.com')).toBe('https://staging.serplists.com/api/mcp');
  });
});

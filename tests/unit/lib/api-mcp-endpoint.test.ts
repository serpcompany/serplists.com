import { describe, expect, it } from 'vitest';

import { getAgentMcpEndpoint } from '@/lib/api';

describe('getAgentMcpEndpoint', () => {
  // The API runs on the page's own origin (/api), so agents connect there.
  it("names the MCP endpoint on the page's own origin", () => {
    expect(getAgentMcpEndpoint('http://localhost:3000')).toBe('http://localhost:3000/api/mcp');
    expect(getAgentMcpEndpoint('https://staging.serplists.com')).toBe('https://staging.serplists.com/api/mcp');
  });
});

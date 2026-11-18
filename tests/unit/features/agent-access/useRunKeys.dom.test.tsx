import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_AGENT_KEY } from '../../../fixtures/agentKeys';
import { deferred } from '../../../support/deferred';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useRunKeys } from '@/features/agent-access/useRunKeys';

type Answer = { path: RegExp; body: unknown };

function theApiAnswering(answers: Answer[]) {
  const sent: Array<{ path: string; method: string; body: unknown }> = [];
  const connection = deferred<void>();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname;
    sent.push({ path, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const answer = answers.find((candidate) => candidate.path.test(path));
    if (!answer) return new Response('{}', { status: 404 });
    if (path.endsWith('/agent-keys/connection')) await connection.promise;
    return new Response(JSON.stringify(answer.body), { status: 200 });
  }));
  return { sent, answerTheConnection: () => connection.resolve() };
}

const unmounts: Array<() => void> = [];
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  vi.unstubAllGlobals();
});

async function mountRunKeys() {
  const runKeys = await mountQueryHook(() => useRunKeys());
  unmounts.push(runKeys.unmount);
  return runKeys.current;
}

describe('the Run Keys settings', () => {
  it("shows this site's MCP address until the server names the one agents should use", async () => {
    const api = theApiAnswering([
      { path: /\/agent-keys\/connection$/, body: { mcpEndpoint: 'https://serplists.com/api/mcp', hostMismatch: true } },
      { path: /\/agent-keys$/, body: [ACTIVE_AGENT_KEY] },
    ]);
    const runKeys = await mountRunKeys();

    expect(runKeys().mcpEndpoint).toBe(`${window.location.origin}/api/mcp`);
    expect(runKeys().mcpHostMismatch).toBe(false);

    await act(async () => {
      api.answerTheConnection();
      await settle();
    });

    expect(runKeys().mcpEndpoint).toBe('https://serplists.com/api/mcp');
    expect(runKeys().mcpHostMismatch).toBe(true);
    expect(runKeys().keysQuery.data).toEqual([ACTIVE_AGENT_KEY]);
  });

  it('creates a key with the name and permissions chosen and returns its secret once', async () => {
    const api = theApiAnswering([
      { path: /\/agent-keys\/connection$/, body: { mcpEndpoint: null, hostMismatch: false } },
      { path: /\/agent-keys$/, body: { key: ACTIVE_AGENT_KEY, secret: 'slrk_demo12_secret' } },
    ]);
    const runKeys = await mountRunKeys();

    const created = await runKeys().createKey('Codex SOP Runner', ['runs:read']);

    expect(created).toEqual({ key: ACTIVE_AGENT_KEY, secret: 'slrk_demo12_secret' });
    expect(api.sent.filter(({ method }) => method === 'POST')).toEqual([
      { path: '/api/agent-keys', method: 'POST', body: { name: 'Codex SOP Runner', permissions: ['runs:read'] } },
    ]);
  });
});

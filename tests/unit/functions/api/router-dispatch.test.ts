import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import apiWorker from '@functions/api/[[route]]';
import { handleTemplates } from '@functions/api/handlers/templates';
import { createBetterAuth } from '@functions/api/better-auth';
import { apiEnv } from '../../../support/apiEnv';
import { captureLogLines } from '../../../support/apiRouter';
import { apiErrorBody, betterAuthErrorBody, readJson } from '../../../support/readJson';
import { logLineIn } from '../../../support/storedJson';

vi.mock('@functions/api/better-auth', () => ({
  createBetterAuth: vi.fn(() => ({ handler: async () => Response.json({ handler: 'better-auth' }) })),
}));
vi.mock('@functions/api/handlers/auth', () => ({
  handleProfileByHandle: async () => Response.json({ handler: 'profile-by-handle' }),
  handleProfileByUsername: async () => Response.json({ handler: 'profile-by-username' }),
  handleProfileById: async () => Response.json({ handler: 'profile-by-id' }),
}));
vi.mock('@functions/api/handlers/profile-directory', () => ({ handleProfileDirectory: async () => Response.json({ handler: 'profiles' }) }));
vi.mock('@functions/api/handlers/templates', () => ({ handleTemplates: vi.fn(async () => Response.json({ handler: 'templates' })) }));
vi.mock('@functions/api/handlers/checklists', () => ({ handleChecklists: async () => Response.json({ handler: 'checklists' }) }));
vi.mock('@functions/api/handlers/uploads', () => ({ handleUploads: async () => Response.json({ handler: 'uploads' }) }));
vi.mock('@functions/api/handlers/stripe', () => ({ handleStripe: async () => Response.json({ handler: 'stripe' }) }));
vi.mock('@functions/api/handlers/billing', () => ({ handleBilling: async () => Response.json({ handler: 'billing' }) }));
vi.mock('@functions/api/handlers/admin', () => ({ handleAdmin: async () => Response.json({ handler: 'admin' }) }));
vi.mock('@functions/api/handlers/teams', () => ({ handleTeams: async () => Response.json({ handler: 'teams' }) }));
vi.mock('@functions/api/handlers/clipy', () => ({ handleGenerateTemplateFromClipy: async () => Response.json({ handler: 'clipy' }) }));
vi.mock('@functions/api/handlers/agent-keys', () => ({ handleAgentKeys: async () => Response.json({ handler: 'agent-keys' }) }));
vi.mock('@functions/api/handlers/agentMcp', () => ({ handleAgentMcp: async () => Response.json({ handler: 'mcp' }) }));
vi.mock('@functions/api/handlers/client-errors', () => ({ handleClientErrors: async () => Response.json({ handler: 'client-errors' }) }));

const HOST = 'http://localhost:8788';
const env = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!', PERSONAL_RUN_MCP_ENABLED: 'true' });
const answeredBy = z.object({ handler: z.string() }).passthrough();

function send(method: string, path: string, body?: unknown) {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  return apiWorker.fetch(new Request(`${HOST}/api/${path}`, init), env);
}

describe('the API router', () => {
  let logLines: string[];

  beforeEach(() => {
    logLines = captureLogLines(['info', 'warn', 'error']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['POST', 'client-errors', 'client-errors'],
    ['POST', 'auth/sign-in/email', 'better-auth'],
    ['GET', 'auth/get-session', 'better-auth'],
    ['GET', 'profiles', 'profiles'],
    ['GET', 'profiles/by-handle', 'profile-by-handle'],
    ['GET', 'profiles/by-username', 'profile-by-username'],
    ['GET', 'profiles/by-id', 'profile-by-id'],
    ['POST', 'templates/generate-from-clipy', 'clipy'],
    ['GET', 'agent-keys', 'agent-keys'],
    ['DELETE', 'agent-keys/key-1', 'agent-keys'],
    ['POST', 'mcp', 'mcp'],
    ['GET', 'templates/mine', 'templates'],
    ['GET', 'checklists', 'checklists'],
    ['GET', 'teams', 'teams'],
    ['GET', 'uploads/avatars/a.png', 'uploads'],
    ['POST', 'stripe/webhook', 'stripe'],
    ['GET', 'billing/status', 'billing'],
    ['GET', 'admin/users', 'admin'],
  ])('hands %s /api/%s to the %s handler', async (method, path, handler) => {
    const response = await send(method, path, method === 'GET' ? undefined : {});

    expect(response.status).toBe(200);
    expect(await readJson(response, answeredBy)).toMatchObject({ handler });
  });

  it.each([
    ['a username sign-in', { username: 'john', password: 'a-long-password-1' }],
    ['an email that is not text', { email: 42, password: 'a-long-password-1' }],
  ])('lets %s through to Better Auth under the production policy, which only checks test email domains', async (_label, body) => {
    const request = new Request(`${HOST}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const response = await apiWorker.fetch(request, { ...env, AUTH_EMAIL_VERIFICATION_REQUIRED: 'true' });

    expect(await readJson(response, answeredBy)).toMatchObject({ handler: 'better-auth' });
  });

  it('answers 404 for a path no handler serves', async () => {
    const response = await send('GET', 'nothing-here');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });

  it('answers a HEAD request with the GET status and headers but no body', async () => {
    const response = await send('HEAD', 'health');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('answers 400 when a handler fails to parse the JSON it was sent', async () => {
    vi.mocked(handleTemplates).mockRejectedValueOnce(new SyntaxError('Unexpected token } in JSON'));

    const response = await send('POST', 'templates', {});

    expect(response.status).toBe(400);
    expect(await readJson(response, apiErrorBody)).toMatchObject({ error: 'Invalid JSON' });
  });

  it('answers 500 in the auth error shape and logs the failure when an auth request throws', async () => {
    vi.mocked(createBetterAuth).mockImplementationOnce(() => {
      throw new Error('auth database unreachable');
    });

    const response = await send('GET', 'auth/get-session');

    expect(response.status).toBe(500);
    expect(await readJson(response, betterAuthErrorBody)).toMatchObject({ message: 'Internal Server Error' });
    expect(logLines.map((line) => logLineIn(line))).toContainEqual(
      expect.objectContaining({ message: 'api_error', path: 'auth/get-session', errorMessage: 'auth database unreachable' }),
    );
  });
});

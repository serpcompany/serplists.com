import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { api } from '@/lib/api';
import {
  getAccessFailure,
  isApiError,
  isUnreadableResponseError,
  UNREADABLE_RESPONSE_CODE,
  UNREADABLE_RESPONSE_MESSAGE,
} from '@/lib/api-errors';
import { getAuthStatus } from '@/lib/auth-client';
import { TEMPLATE_UPDATE_RESPONSE_ERROR } from '@/lib/templateUpdateResult';

const serverAnswers = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );

const failureOf = (request: Promise<unknown>): Promise<unknown> => request.then(() => null, (error: unknown) => error);

const template = { id: 'template-1', title: 'Launch', is_public: true, sections: [] };

describe('API client answers, each parsed with the schema its endpoint passes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns what the schema read, without the fields it does not describe', async () => {
    serverAnswers({ id: 'run-1', shareToken: 'token-1', sharePath: '/share/token-1/', share_token: 'kept out' });

    await expect(api.createChecklistRunShare('run-1')).resolves.toEqual({
      id: 'run-1',
      shareToken: 'token-1',
      sharePath: '/share/token-1/',
    });
  });

  it('refuses a body its schema does not describe with the usual request error, carrying the parse failure', async () => {
    serverAnswers({ error: 'not a list' });

    const error = await failureOf(api.getTemplates({ scope: 'personal' }));

    expect(isApiError(error)).toBe(true);
    expect(isUnreadableResponseError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 200,
      code: UNREADABLE_RESPONSE_CODE,
      message: UNREADABLE_RESPONSE_MESSAGE,
      details: { issues: [expect.objectContaining({ code: 'invalid_type' })] },
      cause: expect.any(ZodError),
    });
    expect(getAccessFailure(error, 'Unable to load templates.')).toEqual({ kind: 'error', message: UNREADABLE_RESPONSE_MESSAGE });
  });

  it('refuses a body that is not JSON the same way', async () => {
    serverAnswers('<html>Bad gateway</html>');

    const error = await failureOf(api.getTeams());

    expect(error).toMatchObject({ status: 200, code: UNREADABLE_RESPONSE_CODE, details: { issues: [] } });
  });

  it('keeps the rows of a list it can read and leaves out a row it cannot', async () => {
    serverAnswers([template, { id: 7, title: 'No string id' }, { ...template, id: 'template-2' }]);

    const templates = await api.getTemplates({ scope: 'public' });

    expect(templates.map((row) => row.id)).toEqual(['template-1', 'template-2']);
  });

  it('turns an unreadable answer to a template save into the save error that asks for a reload', async () => {
    serverAnswers({ success: true, slug: 'launch' });

    await expect(api.updateTemplate('template-1', { title: 'Launch' })).rejects.toThrow(TEMPLATE_UPDATE_RESPONSE_ERROR);
  });

  it('refuses an auth status whose fields have the wrong types', async () => {
    serverAnswers({ accountRegistrationAvailable: true, emailAuthAvailable: 'yes', emailVerificationRequired: false });

    await expect(getAuthStatus()).rejects.toBeInstanceOf(ZodError);
  });
});

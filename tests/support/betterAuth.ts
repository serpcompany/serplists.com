import { vi } from 'vitest';
import { z } from 'zod';
import { createBetterAuth } from '@functions/api/better-auth';
import type { Env } from '@functions/api/types';

const sentEmail = z.object({ text: z.string() }).passthrough();

export const LOCAL_AUTH_ORIGIN = 'http://localhost:8788';

type BetterAuthPost = { body?: unknown; cookie?: string; origin?: string };

export function postToBetterAuth(env: Env, path: string, { body, cookie, origin = LOCAL_AUTH_ORIGIN }: BetterAuthPost = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  const request = new Request(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return createBetterAuth(env, request).handler(request);
}

export function sessionCookieFrom(response: Response): string {
  const match = (response.headers.get('set-cookie') ?? '').match(/better-auth\.session_token=[^;]+/);
  if (!match) throw new Error('No session cookie');
  return match[0];
}

export function captureTheEmailsSent(): string[] {
  const sentEmails: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      sentEmails.push(sentEmail.parse(JSON.parse(String(init?.body))).text);
      return new Response('{}', { status: 200 });
    }),
  );
  return sentEmails;
}

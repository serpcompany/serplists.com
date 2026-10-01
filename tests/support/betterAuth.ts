import { vi } from 'vitest';
import { createBetterAuth } from '@functions/api/better-auth';
import type { Env } from '@functions/api/types';

export const LOCAL_AUTH_ORIGIN = 'http://localhost:8788';

type BetterAuthPost = { body?: unknown; cookie?: string; origin?: string };

export function postToBetterAuth(env: Env, path: string, { body, cookie, origin = LOCAL_AUTH_ORIGIN }: BetterAuthPost = {}) {
  const headers: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
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
      sentEmails.push(String(JSON.parse(String(init?.body)).text));
      return new Response('{}', { status: 200 });
    }),
  );
  return sentEmails;
}

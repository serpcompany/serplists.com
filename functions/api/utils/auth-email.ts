import type { Env } from '../types';

export type AuthEmailTag = 'password-reset' | 'email-verification';
type AuthEmailProvider = 'resend' | 'usesend';

export class AuthEmailDeliveryError extends Error {
  constructor(
    readonly provider: AuthEmailProvider,
    readonly tag: AuthEmailTag,
    readonly status: number | null,
  ) {
    super(`${provider} auth email send failed (${status ?? 'network error'}) for ${tag}`);
    this.name = 'AuthEmailDeliveryError';
  }
}

export function isAuthEmailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY || env.USESEND_API_KEY);
}

async function postEmail(
  provider: AuthEmailProvider,
  endpoint: string,
  apiKey: string,
  tag: AuthEmailTag,
  payload: Record<string, string>,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthEmailDeliveryError(provider, tag, null);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new AuthEmailDeliveryError(provider, tag, response.status);
  }
}

async function sendEmail(env: Env, params: { to: string; subject: string; text: string; tag: AuthEmailTag }) {
  const payload = {
    from: env.EMAIL_FROM?.trim() || 'noreply@mail.auth.serp.co',
    to: params.to,
    subject: params.subject,
    text: params.text,
  };

  if (env.RESEND_API_KEY) {
    return postEmail('resend', 'https://api.resend.com/emails', env.RESEND_API_KEY, params.tag, payload);
  }
  if (env.USESEND_API_KEY) {
    return postEmail('usesend', 'https://app.usesend.com/api/v1/emails', env.USESEND_API_KEY, params.tag, payload);
  }

  throw new Error('Auth email provider is not configured. Set RESEND_API_KEY or USESEND_API_KEY.');
}

export async function sendPasswordResetEmail(env: Env, params: { to: string; url: string }) {
  await sendEmail(env, {
    to: params.to,
    subject: 'Reset your password',
    text: `Reset your password: ${params.url}`,
    tag: 'password-reset',
  });
}

export async function sendEmailVerificationEmail(env: Env, params: { to: string; url: string }) {
  await sendEmail(env, {
    to: params.to,
    subject: 'Verify your email',
    text: `Verify your email: ${params.url}`,
    tag: 'email-verification',
  });
}

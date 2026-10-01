import { z } from 'zod';

import { getSessionStorage, succeedsWithoutThrowing } from '@/lib/browserStorage';

export const VERIFY_EMAIL_LOGIN_PATH = '/login/?verify_email=1';

const HANDOFF_STORAGE_KEY = 'serplists:login-email';

const loginStateSchema = z.object({ email: z.string().trim().min(1) });

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function handOffLoginEmail(
  email: string,
  storage: HandoffStorage | undefined = getSessionStorage(),
): void {
  succeedsWithoutThrowing(() => storage?.setItem(HANDOFF_STORAGE_KEY, email));
}

export function peekHandedOffLoginEmail(
  storage: Pick<HandoffStorage, 'getItem'> | undefined = getSessionStorage(),
): string | null {
  try {
    return storage?.getItem(HANDOFF_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function takeHandedOffLoginEmail(
  storage: HandoffStorage | undefined = getSessionStorage(),
): string | null {
  try {
    const email = storage?.getItem(HANDOFF_STORAGE_KEY)?.trim() || null;
    storage?.removeItem(HANDOFF_STORAGE_KEY);
    return email;
  } catch {
    return null;
  }
}

export const buildKeptLoginState = (email: string): { email: string } => ({ email });

export function readKeptLoginEmail(historyState: unknown): string | null {
  const parsed = loginStateSchema.safeParse(historyState);
  return parsed.success ? parsed.data.email : null;
}

export interface LoginPrefill {
  email: string | null;
  searchWithoutEmail: string | null;
}

const isEmailKey = (key: string) => key.toLowerCase() === 'email';

export function readLoginPrefill(search: string, keptEmail: string | null): LoginPrefill {
  const params = new URLSearchParams(search);
  const emailFromOlderLink = params.get('email')?.trim() || null;

  const emailKeys = [...params.keys()].filter(isEmailKey);
  let searchWithoutEmail: string | null = null;
  if (emailKeys.length > 0) {
    emailKeys.forEach((key) => params.delete(key));
    const remaining = params.toString();
    searchWithoutEmail = remaining ? `?${remaining}` : '';
  }

  return {
    email: keptEmail?.trim() || emailFromOlderLink,
    searchWithoutEmail,
  };
}

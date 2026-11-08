import type { ZodError, ZodIssue } from 'zod';

export function firstIssueOf(error: ZodError, fallbackMessage: string): ZodIssue {
  return error.issues[0] ?? { code: 'custom', path: [], message: fallbackMessage };
}

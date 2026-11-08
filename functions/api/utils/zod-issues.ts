import type { ZodError, ZodIssue } from 'zod';

export function firstIssueOf(error: ZodError): ZodIssue {
  const [first] = error.issues;
  if (!first) throw new Error('A failed parse reported no issues');
  return first;
}

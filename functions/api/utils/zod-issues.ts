import { z, type ZodError, type ZodIssue } from 'zod';

const failedParseIssues = z.custom<ZodIssue>().array().nonempty();

export function firstIssueOf(error: ZodError): ZodIssue {
  const [first] = failedParseIssues.parse(error.issues);
  return first;
}

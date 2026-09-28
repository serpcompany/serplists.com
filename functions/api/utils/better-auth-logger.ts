import { log, type LogLevel } from './logger';

/**
 * Better Auth's own log calls, sent through log() as `better_auth` lines.
 *
 * Its default logger prints straight to the console and passes personal data:
 * `User not found { email }` on every sign-in or reset for an unknown address,
 * `{ username }` from the username plugin, and `Sign-up attempt for existing
 * email: <email>` inside the message itself. So the text is scrubbed, plain
 * objects are dropped, and an Error keeps only its name and a scrubbed message.
 *
 * Leave `level` unset: in Better Auth 1.3.4 an explicit 'error', 'warn' or
 * 'debug' also prints every API error through its default console logger, and
 * the default already publishes info, warn and error (not debug).
 */
export const betterAuthLogger = {
  log(level: LogLevel, message: unknown, ...args: unknown[]): void {
    try {
      const text = typeof message === 'string' ? message : '';
      const error = [message, ...args].find((value): value is Error => value instanceof Error);
      const strings = args.filter((value): value is string => typeof value === 'string');
      const cause: unknown = error?.cause;
      log(isRoutineUserMistake(text) ? 'info' : level, 'better_auth', {
        detail: scrub([text, ...strings].filter(Boolean).join(' ')),
        errorName: error?.name,
        errorMessage: error ? scrub(error.message) : undefined,
        errorCause: cause instanceof Error ? scrub(`${cause.name}: ${cause.message}`) : undefined,
      });
    } catch {
      // Logging must never break an auth request.
    }
  },
};

// Anything shaped like an address, including `"Name" <a@b.c>`.
const EMAIL_PATTERN = /[^\s@<>"'(),;:[\]]+@[^\s@<>"'(),;:[\]]+/g;
const MAX_TEXT_LENGTH = 500;

function scrub(text: string): string {
  // Drizzle's DrizzleQueryError appends the bound values (emails, session
  // tokens) after 'params:'; the SQL before it has only placeholders.
  const withoutParams = text.split(/\n?\s*params:/)[0] ?? '';
  return withoutParams.replace(EMAIL_PATTERN, '[email]').slice(0, MAX_TEXT_LENGTH);
}

// Better Auth logs these at error level, but they are ordinary user mistakes:
// a mistyped email or password, a reset for an unknown address, a repeat sign-up.
const ROUTINE_MESSAGES = new Set([
  'User not found',
  'Credential account not found',
  'Password not found',
  'Invalid password',
  'Username or password not found',
  'Reset Password: User not found',
]);

function isRoutineUserMistake(message: string): boolean {
  return ROUTINE_MESSAGES.has(message) || message.startsWith('Sign-up attempt for existing email');
}

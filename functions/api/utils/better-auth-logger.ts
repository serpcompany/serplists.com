import { log, type LogLevel } from './logger';

export const betterAuthLogger = {
  log(level: LogLevel, message: unknown, ...args: unknown[]): void {
    try {
      logBetterAuthCall(level, message, args);
    } catch {
      return;
    }
  },
};

function logBetterAuthCall(level: LogLevel, message: unknown, args: unknown[]): void {
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
}

const EMAIL_ADDRESS_PATTERN = /[^\s@<>"'(),;:[\]]+@[^\s@<>"'(),;:[\]]+/g;
const DRIZZLE_QUERY_PARAMS_SECTION = /\n?\s*params:/;
const MAX_TEXT_LENGTH = 500;

function scrub(text: string): string {
  const withoutQueryParams = text.split(DRIZZLE_QUERY_PARAMS_SECTION)[0] ?? '';
  return withoutQueryParams.replace(EMAIL_ADDRESS_PATTERN, '[email]').slice(0, MAX_TEXT_LENGTH);
}

const ROUTINE_USER_MISTAKE_MESSAGES = new Set([
  'User not found',
  'Credential account not found',
  'Password not found',
  'Invalid password',
  'Username or password not found',
  'Reset Password: User not found',
]);

function isRoutineUserMistake(message: string): boolean {
  return ROUTINE_USER_MISTAKE_MESSAGES.has(message) || message.startsWith('Sign-up attempt for existing email');
}

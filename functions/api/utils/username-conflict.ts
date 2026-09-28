import type { Adapter, GenericEndpointContext } from 'better-auth';
import { APIError } from 'better-auth/api';
import { log } from './logger';

export const USERNAME_TAKEN_CODE = 'USERNAME_IS_ALREADY_TAKEN';
export const USERNAME_TAKEN_MESSAGE = 'Username is already taken. Please try another.';

export function usernameTakenError(): APIError {
  return new APIError('UNPROCESSABLE_ENTITY', { message: USERNAME_TAKEN_MESSAGE, code: USERNAME_TAKEN_CODE });
}

const USERNAME_UNIQUE_VIOLATION = /UNIQUE constraint failed: users\.username\b/i;

/** D1 reports the idx_users_username violation on the error Drizzle wraps as `cause`. */
export function isUsernameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (USERNAME_UNIQUE_VIOLATION.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * The username plugin's "already taken" check on /update-user only runs when
 * its before-hook sees a session, and Better Auth 1.3.4 resolves the session
 * after those hooks, so the check never fires. This runs in the user update
 * database hook instead, inside the endpoint, where the caller's session is
 * set and the username has already been normalized to the value being written.
 */
export async function assertUsernameAvailableForUpdate(
  update: Record<string, unknown>,
  context: GenericEndpointContext | undefined,
): Promise<void> {
  const { username } = update;
  if (typeof username !== 'string' || username === '' || !context) return;
  const callerId = context.context.session?.user.id;
  // No signed-in caller to compare with: the unique index still guards the write.
  if (!callerId) return;

  const owner = await context.context.adapter.findOne<{ id: string }>({
    model: 'user',
    where: [{ field: 'username', value: username }],
  });
  if (owner && owner.id !== callerId) throw usernameTakenError();
}

/**
 * Two requests can claim the same username between the check above and the
 * write, and D1's UNIQUE idx_users_username then rejects the second write with
 * an error Better Auth answers as a bodyless 500. Map it to the same 422.
 */
export function mapUsernameConflicts<Options>(createAdapter: (options: Options) => Adapter) {
  return (options: Options): Adapter => {
    const adapter = createAdapter(options);
    return {
      ...adapter,
      create: mapConflictsFrom(adapter.create, 'create'),
      update: mapConflictsFrom(adapter.update, 'update'),
    };
  };
}

function mapConflictsFrom<Write extends (...args: never[]) => Promise<unknown>>(write: Write, operation: string): Write {
  const mapped = (...args: Parameters<Write>) =>
    write(...args).catch((error: unknown) => {
      if (!isUsernameUniqueViolation(error)) throw error;
      log('warn', 'username_unique_conflict', { operation });
      throw usernameTakenError();
    });
  // Same arguments and result as `write`; only the rejection changes.
  return mapped as Write;
}

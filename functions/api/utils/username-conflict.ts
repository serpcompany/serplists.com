import type { Adapter, GenericEndpointContext } from 'better-auth';
import { APIError } from 'better-auth/api';
import { log } from './logger';

export const USERNAME_TAKEN_CODE = 'USERNAME_IS_ALREADY_TAKEN';
export const USERNAME_TAKEN_MESSAGE = 'Username is already taken. Please try another.';

export function usernameTakenError(): APIError {
  return new APIError('UNPROCESSABLE_ENTITY', { message: USERNAME_TAKEN_MESSAGE, code: USERNAME_TAKEN_CODE });
}

const USERNAME_UNIQUE_VIOLATION = /UNIQUE constraint failed: users\.username\b/i;

export function isUsernameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (USERNAME_UNIQUE_VIOLATION.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export async function assertUsernameAvailableForUpdate(
  update: Record<string, unknown>,
  context: GenericEndpointContext | undefined,
): Promise<void> {
  const { username } = update;
  if (typeof username !== 'string' || username === '' || !context) return;
  const callerId = context.context.session?.user.id;
  if (!callerId) return;

  const owner = await context.context.adapter.findOne<{ id: string }>({
    model: 'user',
    where: [{ field: 'username', value: username }],
  });
  if (owner && owner.id !== callerId) throw usernameTakenError();
}

export function mapUsernameConflicts<Options>(createAdapter: (options: Options) => Adapter) {
  return (options: Options): Adapter => {
    const adapter = createAdapter(options);
    return {
      ...adapter,
      create: (data) => mapConflicts(adapter.create(data), 'create'),
      update: (data) => mapConflicts(adapter.update(data), 'update'),
    };
  };
}

function mapConflicts<Result>(write: Promise<Result>, operation: string): Promise<Result> {
  return write.catch((error: unknown) => {
    if (!isUsernameUniqueViolation(error)) throw error;
    log('warn', 'username_unique_conflict', { operation });
    throw usernameTakenError();
  });
}

import { APIError } from 'better-auth/api';
import type { ZodError } from 'zod';
import type { Env } from '../types';
import {
  USER_IMAGE_URL_MAX_LENGTH,
  displayUsernameSchema,
  userNameSchema,
} from '../../../src/lib/schemas/userProfileSchema';

type UserWrite = Record<string, unknown>;

export type UserProfileWritePolicy = {
  /** URL prefixes an avatar image may start with: uploads served by SERP Lists. */
  avatarUrlPrefixes: string[];
};

/**
 * Avatars are uploaded through POST /api/uploads, which returns
 * `${R2_PUBLIC_BASE_URL || request origin}/api/uploads/file?key=...`. Accept
 * those URLs on the request origin, the configured frontend origins and the
 * public R2 base, and nothing else (no data: URIs or third-party trackers).
 */
export function buildUserProfileWritePolicy(env: Env, trustedOrigins: Iterable<string>): UserProfileWritePolicy {
  const bases = new Set<string>(trustedOrigins);
  if (env.R2_PUBLIC_BASE_URL) {
    bases.add(env.R2_PUBLIC_BASE_URL);
    bases.add(env.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''));
  }
  return { avatarUrlPrefixes: Array.from(bases, (base) => `${base}/api/uploads/`) };
}

function reject(message: string): never {
  throw new APIError('BAD_REQUEST', { message });
}

function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid value.';
}

function parseAvatarUrl(value: unknown, policy: UserProfileWritePolicy): string | null {
  // AvatarUpload removes an avatar with `image: null`; an empty string means the same.
  if (value === null || value === '') return null;
  if (typeof value !== 'string') reject('Avatar image must be a URL.');
  if (value.length > USER_IMAGE_URL_MAX_LENGTH) {
    reject(`Avatar image URL must be ${USER_IMAGE_URL_MAX_LENGTH} characters or fewer.`);
  }

  let href: string;
  try {
    href = new URL(value).href;
  } catch {
    reject('Avatar image must be a URL.');
  }
  if (!policy.avatarUrlPrefixes.some((prefix) => href.startsWith(prefix))) {
    reject('Upload the avatar image to SERP Lists.');
  }
  return value;
}

/**
 * Validates the user fields people can set through Better Auth (sign-up and
 * update-user). Runs from databaseHooks, so it sees every user write: on an
 * update it checks only the fields being written, because Better Auth also
 * updates users internally (email verification, username, timestamps).
 * Throws a 400 APIError; returns the data with the name trimmed.
 */
export function validateUserProfileWrite(
  data: UserWrite,
  action: 'create' | 'update',
  policy: UserProfileWritePolicy,
): UserWrite {
  const sanitized: UserWrite = { ...data };

  if (action === 'create' || data.name !== undefined) {
    const name = userNameSchema.safeParse(data.name);
    if (!name.success) reject(firstIssue(name.error));
    sanitized.name = name.data;
  }

  if (data.image !== undefined) {
    sanitized.image = parseAvatarUrl(data.image, policy);
  }

  if (data.displayUsername !== undefined) {
    const displayUsername = displayUsernameSchema.safeParse(data.displayUsername);
    if (!displayUsername.success) reject(firstIssue(displayUsername.error));
  }

  return sanitized;
}

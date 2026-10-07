import { z } from 'zod';

export const PUBLIC_HANDLE_MIN_LENGTH = 3;
export const PUBLIC_HANDLE_MAX_LENGTH = 30;
const PUBLIC_HANDLE_CHARACTERS = /^[A-Za-z0-9_.-]+$/;

export const publicHandleSchema = z
  .string()
  .trim()
  .min(PUBLIC_HANDLE_MIN_LENGTH, `Use at least ${PUBLIC_HANDLE_MIN_LENGTH} characters.`)
  .max(PUBLIC_HANDLE_MAX_LENGTH, `Use ${PUBLIC_HANDLE_MAX_LENGTH} characters or fewer.`)
  .regex(PUBLIC_HANDLE_CHARACTERS, 'Use only letters, numbers, underscores, periods and hyphens.');

export const isPublicHandle = (value: string): boolean =>
  value.length >= PUBLIC_HANDLE_MIN_LENGTH &&
  value.length <= PUBLIC_HANDLE_MAX_LENGTH &&
  PUBLIC_HANDLE_CHARACTERS.test(value);

export const normalizePublicHandle = (value: string): string =>
  value.replace(/^ +| +$/g, '').replace(/[A-Z]/g, (letter) => letter.toLowerCase());

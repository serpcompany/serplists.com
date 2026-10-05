import { z } from 'zod';

const PUBLIC_HANDLE_MIN_LENGTH = 3;
const PUBLIC_HANDLE_MAX_LENGTH = 30;

export const publicHandleSchema = z
  .string()
  .trim()
  .min(PUBLIC_HANDLE_MIN_LENGTH, `Use at least ${PUBLIC_HANDLE_MIN_LENGTH} characters.`)
  .max(PUBLIC_HANDLE_MAX_LENGTH, `Use ${PUBLIC_HANDLE_MAX_LENGTH} characters or fewer.`)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Use only letters, numbers, underscores, periods and hyphens.');

export const normalizePublicHandle = (value: string): string =>
  value.replace(/^ +| +$/g, '').replace(/[A-Z]/g, (letter) => letter.toLowerCase());

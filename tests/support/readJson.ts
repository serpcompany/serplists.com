import { expect } from 'vitest';
import { z } from 'zod';
import type { ResponseSchema } from '@/lib/api/request';

type JsonBody = { json(): Promise<unknown> };

export async function readJson<Output>(body: JsonBody, schema: ResponseSchema<Output>): Promise<Output> {
  return schema.parse(await body.json());
}

export const jsonObject = z.record(z.unknown());

export const jsonObjects = z.array(jsonObject);

export const betterAuthErrorBody = z.object({ message: z.string(), code: z.string().optional() }).passthrough();

export const apiErrorBody = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    message: z.string().optional(),
    details: z.unknown(),
    retryAfterSeconds: z.number().optional(),
  })
  .passthrough();

export async function readSuccessfulJson<Output>(response: Response, schema: ResponseSchema<Output>): Promise<Output> {
  expect(response.status).toBe(200);
  return readJson(response, schema);
}

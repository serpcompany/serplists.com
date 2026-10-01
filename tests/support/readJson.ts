import { expect } from 'vitest';
import { z } from 'zod';

type JsonBody = { json(): Promise<unknown> };

export async function readJson<Schema extends z.ZodTypeAny>(body: JsonBody, schema: Schema): Promise<z.output<Schema>> {
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

export async function readSuccessfulJson<Schema extends z.ZodTypeAny>(response: Response, schema: Schema): Promise<z.output<Schema>> {
  expect(response.status).toBe(200);
  return readJson(response, schema);
}

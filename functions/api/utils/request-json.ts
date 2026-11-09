import type { z } from 'zod';
import { jsonError } from './response';

type Refusal = { response: Response };

export async function readJsonBody(request: Request): Promise<{ body: unknown } | Refusal> {
  try {
    const body: unknown = await request.json();
    return { body };
  } catch {
    return { response: jsonError('Invalid JSON payload', 400) };
  }
}

export function invalidPayloadResponse(error: z.ZodError, fallbackMessage: string): Response {
  return jsonError(error.issues[0]?.message || fallbackMessage, 400);
}

export async function readJsonPayload<Payload>(
  request: Request,
  schema: z.ZodType<Payload, z.ZodTypeDef, unknown>,
  fallbackMessage: string,
): Promise<{ body: unknown; payload: Payload } | Refusal> {
  const read = await readJsonBody(request);
  if ('response' in read) return read;
  const parsed = schema.safeParse(read.body);
  if (!parsed.success) return { response: invalidPayloadResponse(parsed.error, fallbackMessage) };
  return { body: read.body, payload: parsed.data };
}

export async function readJsonOrNull(request: Request): Promise<unknown> {
  const read = await readJsonBody(request);
  return 'body' in read ? read.body : null;
}

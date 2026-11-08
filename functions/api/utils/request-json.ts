import type { z } from 'zod';
import { jsonError } from './response';
import { firstIssueOf } from './zod-issues';

type Refusal = { response: Response };

export async function readJsonBody(request: Request): Promise<{ body: unknown } | Refusal> {
  try {
    const body: unknown = await request.json();
    return { body };
  } catch {
    return { response: jsonError('Invalid JSON payload', 400) };
  }
}

export function invalidPayloadResponse(error: z.ZodError): Response {
  return jsonError(firstIssueOf(error).message, 400);
}

export async function readJsonPayload<Payload>(
  request: Request,
  schema: z.ZodType<Payload, z.ZodTypeDef, unknown>,
): Promise<{ body: unknown; payload: Payload } | Refusal> {
  const read = await readJsonBody(request);
  if ('response' in read) return read;
  const parsed = schema.safeParse(read.body);
  if (!parsed.success) return { response: invalidPayloadResponse(parsed.error) };
  return { body: read.body, payload: parsed.data };
}

export async function readJsonOrNull(request: Request): Promise<unknown> {
  const read = await readJsonBody(request);
  return 'body' in read ? read.body : null;
}

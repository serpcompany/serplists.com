import { readBodyWithinLimit } from './body';
import { TEMPLATE_UPLOAD_MAX_BYTES, formatUploadLimit } from '../../../src/lib/schemas/uploadLimits';

const MB = 1024 * 1024;
const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = MB;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type BodyLimit = {
  maxBytes: number;
  label: string;
  withoutContentLength: 'count' | 'answer411';
};

type BodyLimitRejection = { status: 411 | 413; error: string };

export type BodyLimitCheck = { rejection: BodyLimitRejection } | { request: Request };

export function requestBodyLimit(path: string): BodyLimit {
  if (path === 'uploads' || path.startsWith('uploads/')) {
    return {
      maxBytes: TEMPLATE_UPLOAD_MAX_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
      label: formatUploadLimit(TEMPLATE_UPLOAD_MAX_BYTES),
      withoutContentLength: 'answer411',
    };
  }
  if (path.startsWith('templates/backup')) {
    return { maxBytes: 2 * MB, label: '2MB', withoutContentLength: 'count' };
  }
  if (path === 'auth' || path.startsWith('auth/')) {
    return { maxBytes: 16 * 1024, label: '16KB', withoutContentLength: 'count' };
  }
  return { maxBytes: MB, label: '1MB', withoutContentLength: 'count' };
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function tooLarge(limit: BodyLimit): BodyLimitRejection {
  return { status: 413, error: `Payload too large (max ${limit.label})` };
}

export async function checkRequestBodyLimit(request: Request, path: string): Promise<BodyLimitCheck> {
  const { body } = request;
  if (!BODY_METHODS.has(request.method) || !body) return { request };

  const limit = requestBodyLimit(path);
  const declaredBytes = parseContentLength(request.headers.get('Content-Length'));
  if (declaredBytes !== null) {
    return declaredBytes > limit.maxBytes ? { rejection: tooLarge(limit) } : { request };
  }
  if (limit.withoutContentLength === 'answer411') {
    return { rejection: { status: 411, error: 'Content-Length required' } };
  }

  const bytes = await readBodyWithinLimit(body, limit.maxBytes);
  return bytes ? { request: new Request(request, { body: bytes }) } : { rejection: tooLarge(limit) };
}

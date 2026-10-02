import { isBodyWithinLimit } from './body';
import { TEMPLATE_UPLOAD_MAX_BYTES, formatUploadLimit } from '../../../src/lib/schemas/uploadLimits';

const MB = 1024 * 1024;
const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = MB;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type BodyLimit = {
  maxBytes: number;
  label: string;
  withoutContentLength: 'countClone' | 'answer411';
};

export type BodyLimitRejection = { status: 411 | 413; error: string };

export function requestBodyLimit(path: string): BodyLimit {
  if (path === 'uploads' || path.startsWith('uploads/')) {
    return {
      maxBytes: TEMPLATE_UPLOAD_MAX_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
      label: formatUploadLimit(TEMPLATE_UPLOAD_MAX_BYTES),
      withoutContentLength: 'answer411',
    };
  }
  if (path.startsWith('templates/backup')) {
    return { maxBytes: 2 * MB, label: '2MB', withoutContentLength: 'countClone' };
  }
  if (path === 'auth' || path.startsWith('auth/')) {
    return { maxBytes: 16 * 1024, label: '16KB', withoutContentLength: 'countClone' };
  }
  return { maxBytes: MB, label: '1MB', withoutContentLength: 'countClone' };
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function tooLarge(limit: BodyLimit): BodyLimitRejection {
  return { status: 413, error: `Payload too large (max ${limit.label})` };
}

export async function checkRequestBodyLimit(request: Request, path: string): Promise<BodyLimitRejection | null> {
  if (!BODY_METHODS.has(request.method) || !request.body) return null;

  const limit = requestBodyLimit(path);
  const declaredBytes = parseContentLength(request.headers.get('Content-Length'));
  if (declaredBytes !== null) {
    return declaredBytes > limit.maxBytes ? tooLarge(limit) : null;
  }
  if (limit.withoutContentLength === 'answer411') {
    return { status: 411, error: 'Content-Length required' };
  }

  return (await isBodyWithinLimit(request.clone(), limit.maxBytes)) ? null : tooLarge(limit);
}

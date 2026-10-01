import { jsonError } from './response';

export type RangeRequest =
  | { kind: 'full' }
  | { kind: 'partial'; range: R2Range }
  | { kind: 'unsatisfiable' };

const SINGLE_BYTE_RANGE = /^bytes=(\d*)-(\d*)$/i;

export function parseRangeHeader(value: string | null): RangeRequest {
  const match = value ? SINGLE_BYTE_RANGE.exec(value.trim()) : null;
  if (!match) return { kind: 'full' };
  const [, first, last] = match;

  if (first === '') {
    if (last === '') return { kind: 'full' };
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix)) return { kind: 'full' };
    return suffix === 0 ? { kind: 'unsatisfiable' } : { kind: 'partial', range: { suffix } };
  }

  const offset = Number(first);
  if (!Number.isSafeInteger(offset)) return { kind: 'full' };
  if (last === '') return { kind: 'partial', range: { offset } };

  const end = Number(last);
  if (!Number.isSafeInteger(end) || end < offset) return { kind: 'full' };
  return { kind: 'partial', range: { offset, length: end - offset + 1 } };
}

function isSuffixRange(range: R2Range): range is { suffix: number } {
  return 'suffix' in range && typeof range.suffix === 'number';
}

export function resolveByteRange(range: R2Range, size: number): { start: number; end: number } | null {
  if (isSuffixRange(range)) {
    if (range.suffix <= 0 || size === 0) return null;
    return { start: Math.max(0, size - range.suffix), end: size - 1 };
  }
  if (!('offset' in range) && !('length' in range)) return null;
  const start = range.offset ?? 0;
  if (start >= size) return null;
  const end = range.length === undefined ? size - 1 : Math.min(start + range.length, size) - 1;
  return end < start ? null : { start, end };
}

function objectHeaders(object: R2Object, cacheControl: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', cacheControl);
  headers.set('Accept-Ranges', 'bytes');
  return headers;
}

function hasBody(object: R2Object | R2ObjectBody): object is R2ObjectBody {
  return 'body' in object;
}

async function rangeNotSatisfiable(bucket: R2Bucket, key: string): Promise<Response> {
  const object = await bucket.head(key);
  if (!object) return jsonError('Not Found', 404);
  const response = jsonError('Range not satisfiable', 416);
  response.headers.set('Content-Range', `bytes */${object.size}`);
  response.headers.set('Accept-Ranges', 'bytes');
  return response;
}

async function isRangeUnsatisfiable(bucket: R2Bucket, key: string, range: R2Range): Promise<boolean> {
  const object = await bucket.head(key);
  return object !== null && resolveByteRange(range, object.size) === null;
}

async function getObject(
  bucket: R2Bucket,
  key: string,
  headers: Headers,
  range: R2Range | undefined,
): Promise<R2ObjectBody | R2Object | null | 'unsatisfiable'> {
  if (!range) return bucket.get(key, { onlyIf: headers });
  try {
    return await bucket.get(key, { onlyIf: headers, range });
  } catch (error) {
    if (await isRangeUnsatisfiable(bucket, key, range)) return 'unsatisfiable';
    throw error;
  }
}

function ifRangeNamesAnotherVersion(request: Request, object: R2Object): boolean {
  const ifRange = request.headers.get('If-Range');
  return ifRange !== null && ifRange !== object.httpEtag;
}

function preconditionFailedStatus(request: Request): 304 | 412 {
  const isCacheRevalidation = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since');
  return isCacheRevalidation ? 304 : 412;
}

export async function serveR2Object(
  request: Request,
  bucket: R2Bucket,
  key: string,
  cacheControl: string,
): Promise<Response> {
  if (request.method === 'HEAD') {
    const object = await bucket.head(key);
    if (!object) return jsonError('Not Found', 404);
    const headers = objectHeaders(object, cacheControl);
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const requested = parseRangeHeader(request.headers.get('Range'));
  if (requested.kind === 'unsatisfiable') return rangeNotSatisfiable(bucket, key);

  let range = requested.kind === 'partial' ? requested.range : undefined;
  let object = await getObject(bucket, key, request.headers, range);
  if (object === 'unsatisfiable') return rangeNotSatisfiable(bucket, key);

  if (range && object && hasBody(object) && ifRangeNamesAnotherVersion(request, object)) {
    await object.body.cancel();
    range = undefined;
    object = await getObject(bucket, key, request.headers, undefined);
  }

  if (!object || object === 'unsatisfiable') return jsonError('Not Found', 404);

  const headers = objectHeaders(object, cacheControl);
  if (!hasBody(object)) {
    return new Response(null, { status: preconditionFailedStatus(request), headers });
  }

  if (!range) {
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  }

  const served = resolveByteRange(object.range ?? range, object.size);
  if (!served) {
    await object.body.cancel();
    return rangeNotSatisfiable(bucket, key);
  }
  headers.set('Content-Range', `bytes ${served.start}-${served.end}/${object.size}`);
  headers.set('Content-Length', String(served.end - served.start + 1));
  return new Response(object.body, { status: 206, headers });
}

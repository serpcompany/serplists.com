import { jsonError } from './response';

/**
 * Serves R2 objects with byte ranges and conditional requests (RFC 9110).
 * Media players depend on this: Safari will not play a video whose
 * `Range: bytes=0-1` probe gets a 200, and no browser can seek past what it has
 * buffered without 206 responses. Pages Functions responses do not pass through
 * the CDN cache, so nothing else answers ranges for us.
 */

export type RangeRequest =
  | { kind: 'full' }
  | { kind: 'partial'; range: R2Range }
  | { kind: 'unsatisfiable' };

const SINGLE_BYTE_RANGE = /^bytes=(\d*)-(\d*)$/i;

/**
 * Parses a single `bytes` range. Multiple ranges, other units and invalid
 * values are ignored (the whole file is a valid answer); R2 serves one range.
 */
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

/** First and last byte served for `range` of an object of `size` bytes, or null when unsatisfiable. */
export function resolveByteRange(range: R2Range, size: number): { start: number; end: number } | null {
  if ('suffix' in range) {
    if (range.suffix <= 0 || size === 0) return null;
    return { start: Math.max(0, size - range.suffix), end: size - 1 };
  }
  const start = range.offset ?? 0;
  if (start >= size) return null;
  const end = range.length === undefined ? size - 1 : Math.min(start + range.length, size) - 1;
  return end < start ? null : { start, end };
}

function objectHeaders(object: R2Object, cacheControl: string): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Files are served from the app's origin: never let a browser guess another type.
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
    // R2 rejects a range that starts at or past the end of the object.
    const object = await bucket.head(key);
    if (object && resolveByteRange(range, object.size) === null) return 'unsatisfiable';
    throw error;
  }
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

  // If-Range: only serve part of the file when the client's copy is current.
  const ifRange = request.headers.get('If-Range');
  if (range && object && hasBody(object) && ifRange !== null && ifRange !== object.httpEtag) {
    await object.body.cancel();
    range = undefined;
    object = await getObject(bucket, key, request.headers, undefined);
  }

  if (!object || object === 'unsatisfiable') return jsonError('Not Found', 404);

  const headers = objectHeaders(object, cacheControl);
  if (!hasBody(object)) {
    // A precondition failed: a cache revalidation gets 304, a write-style precondition 412.
    const revalidation = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since');
    return new Response(null, { status: revalidation ? 304 : 412, headers });
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

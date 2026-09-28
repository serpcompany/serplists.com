import type { Env } from '../types';
import { getSessionUserId } from '../utils/session';
import { serveR2Object } from '../utils/r2-file-response';
import {
  UPLOAD_MAX_BYTES,
  formatUploadLimit,
  type UploadBucket,
} from '../../../src/lib/schemas/uploadLimits';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const allowedMimeTypesByBucket: Record<UploadBucket, Set<string>> = {
  avatars: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  'template-images': new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  'template-videos': new Set(['video/mp4', 'video/webm', 'video/quicktime']),
  'template-files': new Set([
    'application/pdf',
    'application/zip',
    'application/json',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
};

// Used only when the browser could not tell the type: no Content-Type, or the
// generic application/octet-stream it sends for unregistered extensions.
const mimeTypeByExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The type to store the file as, or null when the bucket does not accept it. */
function resolveUploadType(bucket: UploadBucket, file: File, extension: string): string | null {
  const type =
    !file.type || file.type === 'application/octet-stream'
      ? mimeTypeByExtension[extension.toLowerCase()]
      : file.type;
  return type && allowedMimeTypesByBucket[bucket].has(type) ? type : null;
}

function assertBucket(value: string | null): UploadBucket | null {
  if (
    value === 'avatars' ||
    value === 'template-images' ||
    value === 'template-videos' ||
    value === 'template-files'
  ) {
    return value;
  }
  return null;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Only an account's own avatar (`avatars/<userId>/<file>`) can be deleted.
 * Template media is referenced by Templates, template versions, Runs and
 * public-template clones, and uploads record neither their Personal or
 * Organization owner nor their references, so no one can know a delete is
 * safe, and the uploader may have been disabled in or removed from the
 * Organization. Clearing template media only unlinks it (TD-17).
 */
function isOwnAvatarKey(key: string, userId: string): boolean {
  const [bucket, owner, file, ...rest] = key.split('/');
  return bucket === 'avatars' && owner === userId && Boolean(file) && rest.length === 0;
}

function buildApiUrl(base: string, key: string): string {
  return `${base}/api/uploads/file?key=${encodeURIComponent(key)}`;
}

export async function handleUploads(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "uploads", ...]
  const uploadsSubpath = pathParts.slice(2); // after /api/uploads

  // Public file fetch: GET /api/uploads/file?key=...
  if ((request.method === 'GET' || request.method === 'HEAD') && uploadsSubpath[0] === 'file') {
    const key = url.searchParams.get('key');
    if (!key) return json({ error: 'key required' }, 400);

    // Keys contain a UUID, so objects never change once uploaded.
    return serveR2Object(request, env.R2_UPLOADS, key, 'public, max-age=31536000, immutable');
  }

  // Delete: DELETE /api/uploads/file?key=...
  if (request.method === 'DELETE' && uploadsSubpath[0] === 'file') {
    const userId = await getSessionUserId(request, env);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const key = url.searchParams.get('key');
    if (!key) return json({ error: 'key required' }, 400);

    if (!isOwnAvatarKey(key, userId)) {
      return json({ error: 'Forbidden' }, 403);
    }

    await env.R2_UPLOADS.delete(key);
    return json({ success: true });
  }

  // Upload: POST /api/uploads with multipart form-data { file, bucket }
  if (request.method === 'POST' && uploadsSubpath.length === 0) {
    const userId = await getSessionUserId(request, env);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const form = await request.formData();
    const bucket = assertBucket(form.get('bucket')?.toString() ?? null);
    if (!bucket) return json({ error: 'Invalid bucket' }, 400);

    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'file required' }, 400);

    const maxBytes = UPLOAD_MAX_BYTES[bucket];
    if (file.size > maxBytes) return json({ error: `File too large (max ${formatUploadLimit(maxBytes)})` }, 413);

    const filename = sanitizeFilename(file.name || 'upload');
    const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : '';
    const contentType = resolveUploadType(bucket, file, ext);
    if (!contentType) {
      return json(
        {
          error: 'Unsupported file type for bucket',
          bucket,
          contentType: file.type || null,
          allowed: Array.from(allowedMimeTypesByBucket[bucket]),
        },
        415
      );
    }

    const key = `${bucket}/${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    // Pass the File itself: copying it into an ArrayBuffer would hold a 50MB
    // upload twice, close to the isolate's 128MB memory limit.
    await env.R2_UPLOADS.put(key, file, {
      httpMetadata: {
        contentType,
        contentDisposition: bucket === 'template-files' ? `attachment; filename="${filename}"` : undefined,
      },
    });

    const base = env.R2_PUBLIC_BASE_URL || url.origin;
    const apiUrl = buildApiUrl(base, key);

    return json({
      key,
      url: apiUrl,
      fileName: file.name,
      fileSize: file.size,
      contentType,
    });
  }

  return json({ error: 'Not Found' }, 404);
}

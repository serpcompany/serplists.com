import type { Env } from '../types';
import { getSessionUserId } from '../utils/session';
import { serveR2Object } from '../utils/r2-file-response';
import {
  isUploadBucket,
  resolveUploadContentType,
  unsupportedUploadMessage,
  uploadAcceptAttribute,
  type UploadBucket,
} from '../../../src/lib/schemas/uploadTypes';
import { UPLOAD_MAX_BYTES, formatUploadLimit } from '../../../src/lib/schemas/uploadLimits';

const TEMPLATE_BUCKETS: readonly UploadBucket[] = ['template-images', 'template-videos', 'template-files'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
 * Organization. Clearing template media only unlinks it (TD-19).
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

    // Template uploads are shared by the saved template, its versions, every run
    // started from it, and copies or clones, and nothing counts those references.
    if (TEMPLATE_BUCKETS.some((bucket) => key.startsWith(`${bucket}/`))) {
      return json(
        {
          error: 'Template uploads cannot be deleted because templates, runs, and copies may still use them',
          code: 'asset_referenced',
        },
        403,
      );
    }
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
    const bucket = form.get('bucket')?.toString() ?? null;
    if (!isUploadBucket(bucket)) return json({ error: 'Invalid bucket' }, 400);

    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'file required' }, 400);

    const maxBytes = UPLOAD_MAX_BYTES[bucket];
    if (file.size > maxBytes) return json({ error: `File too large (max ${formatUploadLimit(maxBytes)})` }, 413);

    // The same list the upload pickers use (src/lib/schemas/uploadTypes.ts).
    const contentType = resolveUploadContentType(bucket, file);
    if (!contentType) {
      return json(
        {
          error: unsupportedUploadMessage(bucket),
          code: 'unsupported_file_type',
          bucket,
          contentType: file.type || null,
          allowed: uploadAcceptAttribute(bucket).split(','),
        },
        415
      );
    }

    const filename = sanitizeFilename(file.name || 'upload');
    const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : '';
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

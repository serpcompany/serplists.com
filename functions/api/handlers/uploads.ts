import type { Env } from '../types';
import { getSessionUserId } from '../utils/session';
import {
  isUploadBucket,
  resolveUploadContentType,
  UPLOAD_MAX_BYTES,
  unsupportedUploadMessage,
  uploadAcceptAttribute,
  type UploadBucket,
} from '../../../src/lib/schemas/uploadTypes';
import { formatAssetSizeLimit } from '../../../src/lib/schemas/templateAssetLimits';

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

    const object = await env.R2_UPLOADS.get(key);
    if (!object) return json({ error: 'Not Found' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    // Files are served from the app's origin: never let a browser guess another type.
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

    return new Response(object.body, { status: 200, headers });
  }

  // Delete: DELETE /api/uploads/file?key=...
  if (request.method === 'DELETE' && uploadsSubpath[0] === 'file') {
    const userId = await getSessionUserId(request, env);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const key = url.searchParams.get('key');
    if (!key) return json({ error: 'key required' }, 400);

    // Template uploads are shared by the saved template, its versions, every run
    // started from it, and copies or clones, and nothing counts those references.
    // Deleting one on request would break all of them, so only avatars (referenced
    // only by the user's own profile) can be deleted here.
    if (TEMPLATE_BUCKETS.some((bucket) => key.startsWith(`${bucket}/`))) {
      return json(
        {
          error: 'Template uploads cannot be deleted because templates, runs, and copies may still use them',
          code: 'asset_referenced',
        },
        409,
      );
    }
    if (!key.startsWith(`avatars/${userId}/`)) {
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

    if (file.size > UPLOAD_MAX_BYTES) {
      return json({ error: `File too large (max ${formatAssetSizeLimit(UPLOAD_MAX_BYTES)})` }, 413);
    }

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
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const key = `${bucket}/${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    await env.R2_UPLOADS.put(key, await file.arrayBuffer(), {
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

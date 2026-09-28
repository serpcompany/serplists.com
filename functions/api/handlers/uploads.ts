import type { Env } from '../types';
import { getSessionUserId } from '../utils/session';
import { serveR2Object } from '../utils/r2-file-response';

type UploadBucket = 'avatars' | 'template-images' | 'template-videos' | 'template-files';

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

function isAllowedUploadType(bucket: UploadBucket, file: File): boolean {
  if (!file.type) return true;
  return allowedMimeTypesByBucket[bucket].has(file.type);
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

    // Lightweight safety: only allow deleting keys under the user's prefix.
    if (!key.includes(`/${userId}/`) && !key.startsWith(`avatars/${userId}/`)) {
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

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) return json({ error: 'File too large (max 50MB)' }, 413);

    if (!isAllowedUploadType(bucket, file)) {
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

    const filename = sanitizeFilename(file.name || 'upload');
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const key = `${bucket}/${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    await env.R2_UPLOADS.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
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
      contentType: file.type || null,
    });
  }

  return json({ error: 'Not Found' }, 404);
}

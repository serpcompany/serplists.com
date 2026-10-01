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
const IMMUTABLE_FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function isOwnAvatarKey(key: string, userId: string): boolean {
  const [bucket, owner, file, ...rest] = key.split('/');
  return bucket === 'avatars' && owner === userId && Boolean(file) && rest.length === 0;
}

function buildApiUrl(base: string, key: string): string {
  return `${base}/api/uploads/file?key=${encodeURIComponent(key)}`;
}

async function serveUploadedFile(request: Request, env: Env, url: URL): Promise<Response> {
  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'key required' }, 400);

  return serveR2Object(request, env.R2_UPLOADS, key, IMMUTABLE_FILE_CACHE_CONTROL);
}

async function deleteUploadedFile(request: Request, env: Env, url: URL): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const key = url.searchParams.get('key');
  if (!key) return json({ error: 'key required' }, 400);

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

async function storeUpload(request: Request, env: Env, url: URL): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const form = await request.formData();
  const bucket = form.get('bucket')?.toString() ?? null;
  if (!isUploadBucket(bucket)) return json({ error: 'Invalid bucket' }, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'file required' }, 400);

  const maxBytes = UPLOAD_MAX_BYTES[bucket];
  if (file.size > maxBytes) return json({ error: `File too large (max ${formatUploadLimit(maxBytes)})` }, 413);

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

export async function handleUploads(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const uploadsSubpath = pathParts.slice(2);

  if ((request.method === 'GET' || request.method === 'HEAD') && uploadsSubpath[0] === 'file') {
    return serveUploadedFile(request, env, url);
  }

  if (request.method === 'DELETE' && uploadsSubpath[0] === 'file') {
    return deleteUploadedFile(request, env, url);
  }

  if (request.method === 'POST' && uploadsSubpath.length === 0) {
    return storeUpload(request, env, url);
  }

  return json({ error: 'Not Found' }, 404);
}

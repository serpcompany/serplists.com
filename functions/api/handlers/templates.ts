import { Env } from '../types';
import { createDb } from '../db';
import { jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { archiveTemplate, restoreTemplate } from './template-archive';
import { handleTemplateBackup } from './template-backup';
import { cloneTemplate } from './template-clone';
import { createTemplateForUser } from './template-create';
import { handleTemplateReads } from './template-reads';
import { updateTemplateForUser } from './template-update';

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const userId = await getSessionUserId(request, env);
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const templatesSubpath = pathParts.slice(2);
  const db = createDb(env);

  if (templatesSubpath[0] === 'backup') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    return handleTemplateBackup(request, env, db, url, userId);
  }

  if (request.method === 'GET') {
    return handleTemplateReads(request, env, db, url, userId, templatesSubpath);
  }

  if (request.method === 'POST') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    if (templatesSubpath[0] && templatesSubpath[1] === 'restore') {
      return restoreTemplate(request, env, db, userId, templatesSubpath[0]);
    }

    if (templatesSubpath[0] && templatesSubpath[1] === 'clone') {
      return cloneTemplate(request, env, db, userId, templatesSubpath[0]);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    return createTemplateForUser(request, env, userId, body);
  }

  if (request.method === 'PUT') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON payload', 400);
    }

    return updateTemplateForUser(request, env, userId, templateId, body);
  }

  if (request.method === 'DELETE') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();

    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    return archiveTemplate(request, env, db, userId, templateId);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

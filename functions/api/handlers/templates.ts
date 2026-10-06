import { Env } from '../types';
import { createDb } from '../db';
import { jsonError } from '../utils/response';
import { readJsonBody } from '../utils/request-json';
import { getSessionUserId } from '../utils/session';
import { writeResultResponse } from '../utils/write-refusal';
import { archiveTemplate, restoreTemplate } from './template-archive';
import { handleTemplateBackup } from './template-backup';
import { cloneTemplate } from './template-clone';
import { createTemplateForUser } from './template-create';
import { handleTemplateReads } from './template-reads';
import { transferTemplate } from './template-transfer';
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

    if (templatesSubpath[0] && templatesSubpath[1] === 'transfer') {
      const read = await readJsonBody(request);
      if ('response' in read) return read.response;
      return transferTemplate(request, env, db, userId, templatesSubpath[0], read.body);
    }

    const read = await readJsonBody(request);
    if ('response' in read) return read.response;
    return writeResultResponse(await createTemplateForUser(request, env, userId, read.body));
  }

  if (request.method === 'PUT' || request.method === 'DELETE') {
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const templateId = url.pathname.split('/').pop();
    if (!templateId || templateId === 'templates') {
      return jsonError('Template ID required', 400);
    }

    if (request.method === 'DELETE') {
      return archiveTemplate(request, env, db, userId, templateId);
    }

    const read = await readJsonBody(request);
    if ('response' in read) return read.response;
    return writeResultResponse(await updateTemplateForUser(request, env, userId, templateId, read.body));
  }

  return new Response('Method Not Allowed', { status: 405 });
}

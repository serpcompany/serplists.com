import { Env } from '../types';
import { createDb } from '../db';
import { jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { archiveChecklistRun, restoreChecklistRun } from './checklists-archive';
import { createChecklistRun } from './checklists-create';
import { handleChecklistReads } from './checklists-reads';
import { revalidateChecklistRun } from './checklists-revalidate';
import { shareChecklistRun, stopSharingChecklistRun } from './checklists-share-link';
import { handleSharedChecklist } from './checklists-shared';
import { updateChecklistRun } from './checklists-update';

export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const checklistsSubpath = pathParts.slice(2);
  const db = createDb(env);
  const shareToken = checklistsSubpath[1];
  const userId = await getSessionUserId(request, env);
  const isSharedRoute = checklistsSubpath[0] === 'shared';
  const runIdInSharePath = checklistsSubpath.length === 3 && checklistsSubpath[0] === 'run' && checklistsSubpath[2] === 'share'
    ? checklistsSubpath[1]
    : undefined;
  const isCollectionPath = checklistsSubpath.length === 0;

  if (isSharedRoute) {
    if (!shareToken) {
      return jsonError('Share token required', 400);
    }

    return handleSharedChecklist(request, env, shareToken, userId);
  }

  if (!userId) {
    return jsonError('Unauthorized', 401);
  }

  if (request.method === 'GET') {
    return handleChecklistReads(env, db, url, userId, checklistsSubpath);
  }

  if (request.method === 'POST') {
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'restore') {
      return restoreChecklistRun(request, env, db, userId, checklistsSubpath[0]);
    }

    if (checklistsSubpath[0] && checklistsSubpath[1] === 'revalidate') {
      return revalidateChecklistRun(request, env, db, userId, checklistsSubpath[0]);
    }

    if (runIdInSharePath !== undefined) {
      return shareChecklistRun(request, env, db, userId, runIdInSharePath);
    }

    if (!isCollectionPath) {
      return jsonError('Not found', 404);
    }

    return createChecklistRun(request, env, db, url, userId);
  }

  if (request.method === 'PUT') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return jsonError('Checklist ID required', 400);
    }

    return updateChecklistRun(request, env, db, userId, checklistId);
  }

  if (request.method === 'DELETE' && runIdInSharePath !== undefined) {
    return stopSharingChecklistRun(request, env, db, userId, runIdInSharePath);
  }

  if (request.method === 'DELETE') {
    const checklistId = checklistsSubpath[0];

    if (!checklistId || checklistId === 'checklists') {
      return jsonError('Checklist ID required', 400);
    }

    return archiveChecklistRun(request, env, db, userId, checklistId);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

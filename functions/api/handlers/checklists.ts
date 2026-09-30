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
  const pathParts = url.pathname.split('/').filter(Boolean); // ["api", "checklists", ...]
  const checklistsSubpath = pathParts.slice(2); // after /api/checklists
  const db = createDb(env);
  const shareToken = checklistsSubpath[1];
  const userId = await getSessionUserId(request, env);
  const isSharedRoute = checklistsSubpath[0] === 'shared';

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
    // POST /api/checklists/:id/restore
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'restore') {
      return restoreChecklistRun(request, env, db, userId, checklistsSubpath[0]);
    }

    // POST /api/checklists/:id/revalidate
    if (checklistsSubpath[0] && checklistsSubpath[1] === 'revalidate') {
      return revalidateChecklistRun(request, env, db, userId, checklistsSubpath[0]);
    }

    const isRunShareRequest = checklistsSubpath.length === 3 && checklistsSubpath[0] === 'run' && checklistsSubpath[2] === 'share';
    if (isRunShareRequest) {
      return shareChecklistRun(request, env, db, userId, checklistsSubpath[1]);
    }

    // Only POST /api/checklists creates a run. Anything else (including the removed
    // /:templateId/share route) must not fall through to it.
    if (checklistsSubpath.length > 0) {
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

  // DELETE /api/checklists/run/:id/share: stop sharing. The old link stops working at once.
  if (request.method === 'DELETE' && checklistsSubpath.length === 3 && checklistsSubpath[0] === 'run' && checklistsSubpath[2] === 'share') {
    return stopSharingChecklistRun(request, env, db, userId, checklistsSubpath[1]);
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

import { and, eq, isNull } from 'drizzle-orm';

import { checklist_runs } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';

/**
 * The title of the run a share link opens, or null when the link is not an active share. The
 * share page names the run in its <head> (the page itself shows it too), with the same rule
 * as GET /api/checklists/shared/:token: holding the link is the only credential. One indexed
 * read (idx_checklist_runs_share_token); nothing is cached, since a revoked link must stop
 * naming the run at once.
 */
export async function loadSharedRunTitle(env: Env, shareToken: string): Promise<string | null> {
  const token = shareToken.trim();
  if (!token) return null;
  const [row] = await createDb(env)
    .select({ title: checklist_runs.title })
    .from(checklist_runs)
    .where(
      and(
        eq(checklist_runs.share_token, token),
        eq(checklist_runs.is_public, true),
        isNull(checklist_runs.deleted_at),
      ),
    )
    .limit(1);
  if (!row) return null;
  // The run page names a run with no stored title the same way.
  return typeof row.title === 'string' ? row.title : 'Checklist Run';
}

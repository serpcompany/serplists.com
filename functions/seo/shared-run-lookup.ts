import { and, eq, isNull } from 'drizzle-orm';

import { checklist_runs } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';

const UNTITLED_RUN_TITLE = 'Checklist Run';

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
  return typeof row.title === 'string' ? row.title : UNTITLED_RUN_TITLE;
}

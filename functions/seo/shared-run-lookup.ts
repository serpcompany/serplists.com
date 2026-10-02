import { and, eq, isNull } from 'drizzle-orm';

import { checklistRuns } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';

const UNTITLED_RUN_TITLE = 'Checklist Run';

export async function loadSharedRunTitle(env: Env, shareToken: string): Promise<string | null> {
  const token = shareToken.trim();
  if (!token) return null;
  const [row] = await createDb(env)
    .select({ title: checklistRuns.title })
    .from(checklistRuns)
    .where(
      and(
        eq(checklistRuns.share_token, token),
        eq(checklistRuns.is_public, true),
        isNull(checklistRuns.deleted_at),
      ),
    )
    .limit(1);
  if (!row) return null;
  return typeof row.title === 'string' ? row.title : UNTITLED_RUN_TITLE;
}

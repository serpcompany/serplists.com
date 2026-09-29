import 'server-only';

import { cache } from 'react';

import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { loadSharedRunTitle } from '@functions/seo/shared-run-lookup';
import { buildSharePath } from '@/lib/routes';
import type { PageSeo } from '@/lib/seo/pageMetadata';

import { getWorkerEnv } from '../cloudflare';

/**
 * What /share/<token> says in its <head>: the run's title, as the page shows it, and never
 * indexed. Null when the link is not an active share or the lookup failed; the page then
 * keeps the site's defaults (still noindex: next.config.ts sends X-Robots-Tag for /share).
 */
export const loadSharedRunPageSeo = cache(async (shareToken: string): Promise<PageSeo | null> => {
  try {
    const title = await loadSharedRunTitle(await getWorkerEnv(), shareToken);
    if (title === null) return null;
    return {
      title,
      description: `Shared checklist run for ${title}`,
      keywords: ['shared checklist', 'checklist run'],
      robots: 'noindex, nofollow',
      path: buildSharePath(shareToken),
    };
  } catch (error) {
    log('error', 'shared_run_page_meta_failed', describeErrorForLog(error));
    return null;
  }
});

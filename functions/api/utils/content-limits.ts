import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
  TEMPLATE_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_TOO_LARGE_MESSAGE,
} from '../../../src/lib/schemas/contentLimits';
import { jsonError } from './response';

// Every write of templates.items or checklist_runs.items checks its content here, so nothing
// is stored that its own save route could not accept again (src/lib/schemas/contentLimits.ts).

const LIMITS = {
  template: { maxBytes: TEMPLATE_CONTENT_MAX_BYTES, message: TEMPLATE_CONTENT_TOO_LARGE_MESSAGE },
  run: { maxBytes: RUN_CONTENT_MAX_BYTES, message: RUN_CONTENT_TOO_LARGE_MESSAGE },
} as const;

export type ContentKind = keyof typeof LIMITS;

/**
 * Whether `sections` may be stored: within the limit, or no larger than the content it
 * replaces (`current`), so content stored before the limit can still be saved and trimmed.
 */
export function contentFits(kind: ContentKind, sections: unknown, current?: unknown): boolean {
  const size = contentSaveBytes(sections);
  return size <= LIMITS[kind].maxBytes || (current !== undefined && size <= contentSaveBytes(current));
}

/** 413 content_too_large when `sections` may not be stored (see contentFits), else null. */
export function contentTooLargeResponse(kind: ContentKind, sections: unknown, current?: unknown): Response | null {
  if (contentFits(kind, sections, current)) return null;
  const { maxBytes, message } = LIMITS[kind];
  return jsonError(message, 413, { code: 'content_too_large', details: { limit: maxBytes } });
}

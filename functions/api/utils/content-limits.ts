import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
  TEMPLATE_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_TOO_LARGE_MESSAGE,
} from '../../../src/lib/schemas/contentLimits';
import { jsonError } from './response';

const LIMITS = {
  template: { maxBytes: TEMPLATE_CONTENT_MAX_BYTES, message: TEMPLATE_CONTENT_TOO_LARGE_MESSAGE },
  run: { maxBytes: RUN_CONTENT_MAX_BYTES, message: RUN_CONTENT_TOO_LARGE_MESSAGE },
} as const;

export type ContentKind = keyof typeof LIMITS;

export function contentFits(kind: ContentKind, sections: unknown, current?: unknown): boolean {
  const size = contentSaveBytes(sections);
  return size <= LIMITS[kind].maxBytes || (current !== undefined && size <= contentSaveBytes(current));
}

export function contentTooLargeResponse(kind: ContentKind, sections: unknown, current?: unknown): Response | null {
  if (contentFits(kind, sections, current)) return null;
  const { maxBytes, message } = LIMITS[kind];
  return jsonError(message, 413, { code: 'content_too_large', details: { limit: maxBytes } });
}

import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  RUN_CONTENT_TOO_LARGE_MESSAGE,
  TEMPLATE_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_TOO_LARGE_MESSAGE,
} from '../../../src/lib/schemas/contentLimits';
import { refusalResponse, writeRefusal, type WriteRefusal } from './write-refusal';

const LIMITS = {
  template: { maxBytes: TEMPLATE_CONTENT_MAX_BYTES, message: TEMPLATE_CONTENT_TOO_LARGE_MESSAGE },
  run: { maxBytes: RUN_CONTENT_MAX_BYTES, message: RUN_CONTENT_TOO_LARGE_MESSAGE },
} as const;

export type ContentKind = keyof typeof LIMITS;

export function contentFits(kind: ContentKind, sections: unknown, current?: unknown): boolean {
  const size = contentSaveBytes(sections);
  return size <= LIMITS[kind].maxBytes || (current !== undefined && size <= contentSaveBytes(current));
}

export function contentTooLargeRefusal(kind: ContentKind, sections: unknown, current?: unknown): WriteRefusal | null {
  if (contentFits(kind, sections, current)) return null;
  const { maxBytes, message } = LIMITS[kind];
  return writeRefusal(message, 413, { code: 'content_too_large', details: { limit: maxBytes } });
}

export function contentTooLargeResponse(kind: ContentKind, sections: unknown, current?: unknown): Response | null {
  const refusal = contentTooLargeRefusal(kind, sections, current);
  return refusal && refusalResponse(refusal);
}

import { z } from 'zod';

import type {
  TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from '@/lib/api';
import { formatAuditAction, getAuditActorName, TEMPLATE_HISTORY_LABELS } from '@/lib/auditLabels';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';
import { queryKeys } from '@/lib/queryCache';
import { parseDbTimestamp } from '@/lib/utils/dbTimestamp';

// The API client asks for the same number (src/lib/history.ts).
export const TEMPLATE_HISTORY_DISPLAY_LIMIT = HISTORY_DISPLAY_LIMIT;

export type TemplateHistoryTimelineEntry = {
  actorName: string;
  createdAt: string;
  key: string;
  label: string;
};

// Under ['templates'], so every template mutation (edit, Share, visibility, archive,
// restore, context switch) that invalidates the lists refreshes the Changelog too.
export const getTemplateHistoryQueryKey = (
  templateId: string | undefined,
  userId: string | undefined,
  teamId: string | undefined,
) => queryKeys.templateHistoryFor(templateId ?? 'none', userId, teamId);

// Share and the visibility switch change only is_public; the API marks that update's audit
// event with metadata.visibility (history lists carry metadata, never diffs), and gives the
// version the write stored the same metadata.
const visibilityChangeSchema = z.object({ visibility: z.enum(['public', 'private']) }).passthrough();

const getVisibilityLabel = (entry: TemplateHistoryVersion | TemplateHistoryEvent): string | null => {
  if (entry.action !== 'template.updated') return null;
  const change = visibilityChangeSchema.safeParse(entry.metadata);
  if (!change.success) return null;
  return change.data.visibility === 'public' ? 'Made template public' : 'Made template private';
};

// Who made the change, as the run's Changelog names it: an Agent's edit reads
// "<Run Key name> via MCP · authorized by <user>".
const getActorName = (entry: TemplateHistoryVersion | TemplateHistoryEvent): string =>
  getAuditActorName(entry.actor, entry.metadata);

const getVersionLabel = (version: TemplateHistoryVersion): string =>
  getVisibilityLabel(version) ?? `${formatAuditAction(TEMPLATE_HISTORY_LABELS, version.action)} v${version.version}`;

const getEventLabel = (event: TemplateHistoryEvent): string =>
  getVisibilityLabel(event) ?? formatAuditAction(TEMPLATE_HISTORY_LABELS, event.action);

// Every versioned write also records an audit event with the same action and time.
const getPairKey = (entry: { action: string; createdAt: string }): string =>
  `${entry.action}|${entry.createdAt}`;

const getTime = (value: string): number => parseDbTimestamp(value)?.getTime() ?? 0;

type RankedEntry = TemplateHistoryTimelineEntry & { rank: number; time: number };

/**
 * One Changelog: every version, plus the events no version records (archive, restore).
 * A visibility change is versioned too, and its version reads as the change it made
 * ("Made template public"). Newest first. The API returns up to `limit` of each list,
 * newest first, which always covers the newest `limit` entries of the merge.
 */
export const buildTemplateHistoryTimeline = (
  history: TemplateHistoryResponse | null | undefined,
  limit: number = TEMPLATE_HISTORY_DISPLAY_LIMIT,
): TemplateHistoryTimelineEntry[] => {
  if (!history) {
    return [];
  }

  const versionKeys = new Set(history.versions.map(getPairKey));
  const entries: RankedEntry[] = [
    ...history.versions.map((version) => ({
      actorName: getActorName(version),
      createdAt: version.createdAt,
      key: `version-${version.id}`,
      label: getVersionLabel(version),
      rank: 0,
      time: getTime(version.createdAt),
    })),
    ...history.events
      .filter((event) => !versionKeys.has(getPairKey(event)))
      .map((event) => ({
        actorName: getActorName(event),
        createdAt: event.createdAt,
        key: `event-${event.id}`,
        label: getEventLabel(event),
        rank: 1,
        time: getTime(event.createdAt),
      })),
  ];

  return entries
    .sort(
      (left, right) =>
        right.time - left.time ||
        left.rank - right.rank ||
        left.key.localeCompare(right.key),
    )
    .slice(0, limit)
    .map(({ rank: _rank, time: _time, ...entry }) => entry);
};

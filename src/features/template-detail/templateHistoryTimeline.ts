import { z } from 'zod';

import type {
  TemplateHistoryActor,
  TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from '@/lib/api';
import { formatAuditAction, TEMPLATE_HISTORY_LABELS } from '@/lib/auditLabels';
import { queryKeys } from '@/lib/queryCache';
import { parseDbTimestamp } from '@/lib/utils/dbTimestamp';

export const TEMPLATE_HISTORY_DISPLAY_LIMIT = 8;

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

// Share and the visibility switch send only is_public, which creates no version.
const visibilityOnlyDiffSchema = z
  .object({ is_public: z.union([z.boolean(), z.literal(0), z.literal(1)]) })
  .strict();

const getActorName = (actor?: TemplateHistoryActor): string =>
  actor?.name || actor?.username || actor?.email || 'Unknown user';

const getVersionLabel = (version: TemplateHistoryVersion): string =>
  `${formatAuditAction(TEMPLATE_HISTORY_LABELS, version.action)} v${version.version}`;

const getEventLabel = (event: TemplateHistoryEvent): string => {
  if (event.action === 'template.updated') {
    const visibility = visibilityOnlyDiffSchema.safeParse(event.diff);
    if (visibility.success) {
      return visibility.data.is_public ? 'Made template public' : 'Made template private';
    }
  }

  return formatAuditAction(TEMPLATE_HISTORY_LABELS, event.action);
};

// Every versioned write also records an audit event with the same action and time.
const getPairKey = (entry: { action: string; createdAt: string }): string =>
  `${entry.action}|${entry.createdAt}`;

const getTime = (value: string): number => parseDbTimestamp(value)?.getTime() ?? 0;

type RankedEntry = TemplateHistoryTimelineEntry & { rank: number; time: number };

/**
 * One Changelog: every version, plus the events no version records (archive, restore,
 * visibility changes). Newest first. The API returns up to 50 of each list, newest
 * first, which always covers the newest `limit` entries of the merge.
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
      actorName: getActorName(version.actor),
      createdAt: version.createdAt,
      key: `version-${version.id}`,
      label: getVersionLabel(version),
      rank: 0,
      time: getTime(version.createdAt),
    })),
    ...history.events
      .filter((event) => !versionKeys.has(getPairKey(event)))
      .map((event) => ({
        actorName: getActorName(event.actor),
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

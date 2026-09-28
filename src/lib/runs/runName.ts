import { truncateToLength } from '@/lib/utils/truncateText';

// POST /api/checklists rejects a run title longer than this (checklistPayloadSchema in
// functions/api/utils/payloads.ts); a unit test keeps the two in step.
export const RUN_TITLE_MAX_LENGTH = 160;

const SEPARATOR = ' - ';
const ELLIPSIS = '…';

// '<title> - <suffix>' (the suffix is usually a locale date), shortening the title so the
// whole name fits the run title limit. The suffix is kept because it tells runs apart.
export const buildDefaultRunName = (
  templateTitle: string,
  suffix: string,
  maxLength: number = RUN_TITLE_MAX_LENGTH,
): string => {
  const title = templateTitle.trim();
  const tail = suffix.trim();

  if (!title) {
    return truncateToLength(tail, maxLength).trim();
  }

  const fullName = tail ? `${title}${SEPARATOR}${tail}` : title;
  if (fullName.length <= maxLength) {
    return fullName;
  }

  const titleBudget = maxLength - SEPARATOR.length - tail.length - ELLIPSIS.length;
  // A suffix that leaves no room (or none at all): the title alone is the better name.
  if (!tail || titleBudget < 1) {
    return truncateToLength(title, maxLength).trimEnd();
  }

  return `${truncateToLength(title, titleBudget).trimEnd()}${ELLIPSIS}${SEPARATOR}${tail}`;
};

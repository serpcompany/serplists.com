import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import { truncateToUtf16Length } from '@/lib/utils/truncateText';

export const RUN_TITLE_MAX_LENGTH = RUN_TITLE_MAX;

const SEPARATOR = ' - ';
const ELLIPSIS = '…';

export const buildDefaultRunName = (
  templateTitle: string,
  suffix: string | Date = new Date(),
  maxLength: number = RUN_TITLE_MAX_LENGTH,
): string => {
  const title = templateTitle.trim();
  const tail = (typeof suffix === 'string' ? suffix : suffix.toLocaleString()).trim();

  if (!title) {
    return truncateToUtf16Length(tail, maxLength).trim();
  }

  const fullName = tail ? `${title}${SEPARATOR}${tail}` : title;
  if (fullName.length <= maxLength) {
    return fullName;
  }

  const titleBudget = maxLength - SEPARATOR.length - tail.length - ELLIPSIS.length;
  const nameIsTitleAlone = !tail || titleBudget < 1;
  if (nameIsTitleAlone) {
    return truncateToUtf16Length(title, maxLength).trimEnd();
  }

  return `${truncateToUtf16Length(title, titleBudget).trimEnd()}${ELLIPSIS}${SEPARATOR}${tail}`;
};

export const resolveRunName = (
  input: string | undefined,
  templateTitle: string,
  now: Date = new Date(),
): string => input?.trim() || buildDefaultRunName(templateTitle, now);

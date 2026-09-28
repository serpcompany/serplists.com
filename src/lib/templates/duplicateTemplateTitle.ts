import { TEMPLATE_TITLE_MAX_LENGTH } from '@/lib/schemas/templateLimits';
import { truncateToLength } from '@/lib/utils/truncateText';

const COPY_SUFFIX = ' Copy';

// '<title> Copy', shortening the title so the whole name fits the API's title limit.
// The API trims titles before it measures them, so this does too.
export const buildDuplicateTemplateTitle = (
  title: string,
  maxLength: number = TEMPLATE_TITLE_MAX_LENGTH,
): string => {
  const base = truncateToLength(title.trim(), maxLength - COPY_SUFFIX.length).trimEnd();
  return base ? `${base}${COPY_SUFFIX}` : COPY_SUFFIX.trim();
};

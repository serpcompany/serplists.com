import { TEMPLATE_TITLE_MAX_LENGTH } from '@/lib/schemas/templateFields';
import { truncateToUtf16Length } from '@/lib/utils/truncateText';

const COPY_SUFFIX = ' Copy';

export const buildDuplicateTemplateTitle = (
  title: string,
  maxLength: number = TEMPLATE_TITLE_MAX_LENGTH,
): string => {
  const base = truncateToUtf16Length(title.trim(), maxLength - COPY_SUFFIX.length).trimEnd();
  return base ? `${base}${COPY_SUFFIX}` : COPY_SUFFIX.trim();
};

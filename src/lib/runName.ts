/** The API's run title limit (`boundedRequiredString(160)` in functions/api/utils/payloads.ts). */
export const MAX_RUN_TITLE_LENGTH = 160;

/**
 * The name a run gets when the user leaves the name blank: the template title and
 * the start time. The title part is shortened so the name fits the run title limit.
 */
export const buildDefaultRunName = (templateTitle: string, now: Date = new Date()): string => {
  const stamp = now.toLocaleString();
  const title = templateTitle.trim();

  if (!title) {
    return stamp;
  }

  const suffix = ` - ${stamp}`;
  return `${title.slice(0, Math.max(0, MAX_RUN_TITLE_LENGTH - suffix.length)).trimEnd()}${suffix}`;
};

/** A typed run name (trimmed), or the default name when the field was left blank. */
export const resolveRunName = (
  input: string | undefined,
  templateTitle: string,
  now: Date = new Date(),
): string => input?.trim() || buildDefaultRunName(templateTitle, now);

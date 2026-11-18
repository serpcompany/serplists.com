const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ZONED_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ZONELESS_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const EPOCH_MILLISECONDS = /^\d{10,}$/;
const ECMA_FRACTION_DIGITS = 3;
const UTC = 'Z';
const OFFSET_LENGTH = '+00:00'.length;
const DATE_LENGTH = 'YYYY-MM-DD'.length;
const MINUTES_END = 'YYYY-MM-DDTHH:MM'.length;
const SECONDS_END = 'YYYY-MM-DDTHH:MM:SS'.length;

const buildDateTime = (dateTime: string, zone: string): string => {
  const date = dateTime.slice(0, DATE_LENGTH);
  const time = dateTime.slice(DATE_LENGTH + 1, MINUTES_END);
  const seconds = dateTime.slice(MINUTES_END + 1, SECONDS_END);
  if (!seconds) {
    return `${date}T${time}${zone}`;
  }

  const fraction = dateTime.slice(SECONDS_END + 1);
  const milliseconds = fraction
    ? `.${fraction.slice(0, ECMA_FRACTION_DIGITS).padEnd(ECMA_FRACTION_DIGITS, '0')}`
    : '';
  return `${date}T${time}:${seconds}${milliseconds}${zone}`;
};

const zoneOf = (zoned: string): string => (zoned.endsWith(UTC) ? UTC : zoned.slice(-OFFSET_LENGTH));

export const toEcmaDateTimeString = (value: string): string | null => {
  const trimmed = value.trim();

  if (DATE_ONLY.test(trimmed)) {
    return trimmed;
  }

  if (ZONED_DATE_TIME.test(trimmed)) {
    const zone = zoneOf(trimmed);
    return buildDateTime(trimmed.slice(0, -zone.length), zone);
  }

  if (ZONELESS_DATE_TIME.test(trimmed)) {
    return buildDateTime(trimmed, UTC);
  }

  return null;
};

export const parseDbTimestamp = (value: unknown): Date | null => {
  let date: Date;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (EPOCH_MILLISECONDS.test(trimmed)) {
      date = new Date(Number(trimmed));
    } else {
      const dateTime = toEcmaDateTimeString(trimmed);
      if (!dateTime) {
        return null;
      }
      date = new Date(dateTime);
    }
  } else {
    return null;
  }

  return Number.isFinite(date.getTime()) ? date : null;
};

export const normalizeDbTimestamp = (value: unknown): string | null =>
  parseDbTimestamp(value)?.toISOString() ?? null;

export const formatMonthYear = (value: unknown): string | null =>
  parseDbTimestamp(value)?.toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }) ?? null;

export const formatShortDate = (value: unknown): string =>
  parseDbTimestamp(value)?.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) ?? '';

export const formatLocalDate = (value: unknown): string =>
  parseDbTimestamp(value)?.toLocaleDateString('en-US') ?? '';

export const formatLocalDateTime = (value: unknown): string =>
  parseDbTimestamp(value)?.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) ?? '';

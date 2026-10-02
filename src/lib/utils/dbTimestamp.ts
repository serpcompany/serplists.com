const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ZONED_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;
const ZONELESS_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const EPOCH_MILLISECONDS = /^\d{10,}$/;
const ECMA_FRACTION_DIGITS = 3;

const buildDateTime = (
  date: string,
  time: string,
  seconds: string | undefined,
  fraction: string | undefined,
  zone: string,
): string => {
  if (seconds === undefined) {
    return `${date}T${time}${zone}`;
  }

  const milliseconds =
    fraction === undefined
      ? ''
      : `.${fraction.slice(0, ECMA_FRACTION_DIGITS).padEnd(ECMA_FRACTION_DIGITS, '0')}`;
  return `${date}T${time}:${seconds}${milliseconds}${zone}`;
};

export const toEcmaDateTimeString = (value: string): string | null => {
  const trimmed = value.trim();

  if (DATE_ONLY.test(trimmed)) {
    return trimmed;
  }

  const zoned = ZONED_DATE_TIME.exec(trimmed);
  if (zoned) {
    return buildDateTime(zoned[1], zoned[2], zoned[3], zoned[4], zoned[5]);
  }

  const zoneless = ZONELESS_DATE_TIME.exec(trimmed);
  if (zoneless) {
    return buildDateTime(zoneless[1], zoneless[2], zoneless[3], zoneless[4], 'Z');
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

export const formatLocalDate = (value: unknown): string =>
  parseDbTimestamp(value)?.toLocaleDateString('en-US') ?? '';

export const formatLocalDateTime = (value: unknown): string =>
  parseDbTimestamp(value)?.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) ?? '';

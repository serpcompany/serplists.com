const BACKSLASH = '\\';
const BACKTICK = '`';

const backtickRunLength = (value: string, start: number): number => {
  let end = start;
  while (value[end] === BACKTICK) end += 1;
  return end - start;
};

// Start of the backtick run of exactly `length` that closes a code span, or -1.
const findClosingBacktickRun = (value: string, from: number, length: number): number => {
  let index = value.indexOf(BACKTICK, from);
  while (index !== -1) {
    const runLength = backtickRunLength(value, index);
    if (runLength === length) return index;
    index = value.indexOf(BACKTICK, index + runLength);
  }
  return -1;
};

/**
 * Text is shown exactly as saved, except for one legacy shape. Official templates seeded
 * before the seed was fixed store each text block as a single line with a literal
 * backslash-n where the line breaks belong, and those rows are still in the databases
 * (docs/exec-plans/tech-debt-tracker.md). For a text block with no real line break,
 * each literal backslash-n (or backslash-r backslash-n) becomes a line break, except
 * inside inline code and after an escaping backslash. Text with a real line break was
 * typed by a person and is returned unchanged, so code and Windows paths survive.
 */
export const expandLegacyEscapedNewlines = (value: string): string => {
  if (/[\r\n]/.test(value) || !value.includes(`${BACKSLASH}n`)) return value;

  let result = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index];

    if (char === BACKTICK) {
      const runLength = backtickRunLength(value, index);
      const close = findClosingBacktickRun(value, index + runLength, runLength);
      const end = close === -1 ? index + runLength : close + runLength;
      result += value.slice(index, end);
      index = end;
      continue;
    }

    if (char === BACKSLASH) {
      if (value.startsWith(`${BACKSLASH}n`, index)) {
        result += '\n';
        index += 2;
        continue;
      }
      if (value.startsWith(`${BACKSLASH}r${BACKSLASH}n`, index)) {
        result += '\n';
        index += 4;
        continue;
      }
      // Any other escape (an escaped backslash or backtick) is kept as a pair, so it
      // neither turns into a line break nor opens a code span.
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }
  return result;
};

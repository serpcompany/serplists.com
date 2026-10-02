const BACKSLASH = '\\';
const BACKTICK = '`';

const backtickRunLength = (value: string, start: number): number => {
  let end = start;
  while (value[end] === BACKTICK) end += 1;
  return end - start;
};

const findClosingBacktickRun = (value: string, from: number, length: number): number => {
  let index = value.indexOf(BACKTICK, from);
  while (index !== -1) {
    const runLength = backtickRunLength(value, index);
    if (runLength === length) return index;
    index = value.indexOf(BACKTICK, index + runLength);
  }
  return -1;
};

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
      result += value.slice(index, index + 2);
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }
  return result;
};

export const truncateToUtf16Length = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  let result = '';
  for (const character of value) {
    if (result.length + character.length > maxLength) {
      break;
    }
    result += character;
  }
  return result;
};

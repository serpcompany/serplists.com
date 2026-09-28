// Cuts to at most maxLength UTF-16 units, which is what Zod's max() counts, without
// splitting a surrogate pair.
export const truncateToLength = (value: string, maxLength: number): string => {
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

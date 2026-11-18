const CHARACTERS_GENERATED_CODE_ESCAPES = /[<>/\b\f\n\r\t\0\u2028\u2029]/g;

const unicodeEscapeOf = (character: string): string => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;

export const codeLiteral = (value: unknown): string =>
  JSON.stringify(value).replace(CHARACTERS_GENERATED_CODE_ESCAPES, unicodeEscapeOf);

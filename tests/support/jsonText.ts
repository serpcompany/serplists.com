export const costliestJsonText = (length: number) => "\u0001".repeat(length);

export const TEXT_COSTLIER_IN_JSON = 'He said "ship it" \\ now\n\ttabs\u0001\u001f · Ünïcödé 日本語テキスト 🚀🧪 \uD83D end';

const MULTIBYTE_PROSE = "Confirmed the owner, the rollback plan, and the customer notice — then recorded it. Überprüfen. 界 🚀 ";

export const multibyteProse = (length: number) =>
  MULTIBYTE_PROSE.repeat(Math.ceil(length / MULTIBYTE_PROSE.length)).slice(0, length);

export const MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST = 1.1;

export class DuplicateJsonKeyError extends Error {
  constructor() { super("Duplicate JSON object keys are unsupported."); }
}

// Check each object's decoded keys before JSON.parse discards earlier values.
// The scan does not convert numbers; the caller's reviver retains raw tokens.
export function parseStrictJson(source, reviver) {
  const text = String(source);
  let offset = 0;
  const invalid = () => { throw new SyntaxError("Unsupported JSON syntax."); };
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? "") && offset < text.length) offset++; };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === "\\") offset++;
      else if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)); }
        catch { invalid(); }
      }
    }
    invalid();
  };
  const value = () => {
    whitespace();
    const char = text[offset];
    if (char === '"') { string(); return; }
    if (char === "{" || char === "[") {
      const object = char === "{";
      const close = object ? "}" : "]";
      const keys = new Set();
      offset++;
      whitespace();
      if (text[offset] === close) { offset++; return; }
      while (offset < text.length) {
        if (object) {
          if (text[offset] !== '"') invalid();
          const key = string();
          if (keys.has(key)) throw new DuplicateJsonKeyError();
          keys.add(key);
          whitespace();
          if (text[offset++] !== ":") invalid();
        }
        value();
        whitespace();
        if (text[offset] === close) { offset++; return; }
        if (text[offset++] !== ",") invalid();
        whitespace();
      }
      invalid();
    }
    const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(offset));
    if (!primitive) invalid();
    offset += primitive[0].length;
  };
  try {
    value();
    whitespace();
    if (offset !== text.length) invalid();
    return JSON.parse(text, reviver);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) invalid();
    throw error;
  }
}

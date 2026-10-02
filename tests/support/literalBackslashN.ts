const LITERAL_BACKSLASH_N = `${String.fromCharCode(92)}n`;

type StringAtPath = [path: string, text: string];

function stringsByPath(value: unknown, path: string, found: StringAtPath[] = []): StringAtPath[] {
  if (typeof value === "string") {
    found.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => stringsByPath(entry, `${path}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) stringsByPath(entry, `${path}.${key}`, found);
  }
  return found;
}

export function pathsOfLiteralBackslashN(value: unknown, label: string): string[] {
  return stringsByPath(value, label)
    .filter(([, text]) => text.includes(LITERAL_BACKSLASH_N))
    .map(([path]) => path);
}

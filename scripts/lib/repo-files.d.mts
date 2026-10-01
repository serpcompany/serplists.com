export function walkFiles(root: string, dir: string, predicate: (relativePath: string) => boolean): string[];
export function directoriesAFreshCheckoutLacks(root: string, dirs: readonly string[]): Set<string>;

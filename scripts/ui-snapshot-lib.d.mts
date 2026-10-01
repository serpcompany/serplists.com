export const UI_SNAP_USAGE: string;

export interface SnapshotPaths {
  outPath: string;
  ariaPath: string;
}

export interface UiSnapArgs extends SnapshotPaths {
  routePath: string;
  slug: string;
  mobile: boolean;
  login: string | undefined;
  password: string | undefined;
  base: string | undefined;
  api: string | undefined;
}

export function resolveSnapshotPaths(outArg: string | undefined, slug: string): SnapshotPaths;
export function parseUiSnapArgs(argv: readonly string[]): UiSnapArgs;

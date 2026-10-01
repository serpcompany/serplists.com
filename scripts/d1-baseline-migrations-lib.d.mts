export interface D1DatabaseEntry {
  binding: string;
  database_name?: string | undefined;
  database_id?: string | undefined;
  preview_database_id?: string | undefined;
}

export interface WranglerD1Databases {
  topLevel: D1DatabaseEntry[];
  production: D1DatabaseEntry[];
}

export interface BaselineArgs {
  isRemote: boolean;
  databaseName: string;
  throughMigration: string | null;
  shouldExecute: boolean;
  allowProduction: boolean;
  usePreview: boolean;
  cloudflareEnv: string;
}

export type BaselineTarget =
  | { ok: true; environment: "local" | "staging" | "production"; databaseId: string | null; label: string }
  | { ok: false; error: string };

export function readD1Databases(toml: string): WranglerD1Databases;
export function parseBaselineArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): BaselineArgs;
export function resolveBaselineTarget(
  options: Pick<BaselineArgs, "databaseName" | "isRemote" | "usePreview" | "allowProduction" | "cloudflareEnv"> & {
    d1: WranglerD1Databases;
  },
): BaselineTarget;

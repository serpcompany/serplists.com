import { z } from "zod";

export const RUN_KEY_PERMISSIONS = ["templates:read", "templates:write", "runs:read", "runs:write"] as const;

export type RunKeyPermission = (typeof RUN_KEY_PERMISSIONS)[number];

export const runKeyPermissionSchema = z.enum(RUN_KEY_PERMISSIONS);

// Matches the column default in migration 0027: what every key could do before template writes.
export const DEFAULT_RUN_KEY_PERMISSIONS: readonly RunKeyPermission[] = ["templates:read", "runs:read", "runs:write"];

export const RUN_KEY_PERMISSION_DETAILS: Record<RunKeyPermission, { label: string; description: string }> = {
  "templates:read": { label: "Read templates", description: "List and read your personal templates." },
  "templates:write": {
    label: "Write templates",
    description: "Create private personal templates and edit private ones. Never delete or publish.",
  },
  "runs:read": { label: "Read runs", description: "List and read your personal runs." },
  "runs:write": { label: "Write runs", description: "Start runs and update tasks, notes, and status." },
};

const IMPLIED_READ: Partial<Record<RunKeyPermission, RunKeyPermission>> = {
  "templates:write": "templates:read",
  "runs:write": "runs:read",
};

export function withImpliedRunKeyPermissions(permissions: Iterable<RunKeyPermission>): RunKeyPermission[] {
  const granted = new Set<RunKeyPermission>(permissions);
  for (const permission of [...granted]) {
    const implied = IMPLIED_READ[permission];
    if (implied) granted.add(implied);
  }
  return RUN_KEY_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function toggleRunKeyPermission(
  current: readonly RunKeyPermission[],
  permission: RunKeyPermission,
  enabled: boolean,
): RunKeyPermission[] {
  if (enabled) return withImpliedRunKeyPermissions([...current, permission]);
  return current.filter((granted) => granted !== permission && IMPLIED_READ[granted] !== permission);
}

// Stored values are parsed, not trusted: unknown entries are dropped and a malformed
// column grants nothing.
export function parseStoredRunKeyPermissions(value: unknown): RunKeyPermission[] {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return withImpliedRunKeyPermissions(
    raw.flatMap((entry) => {
      const parsed = runKeyPermissionSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  );
}

import { z } from "zod";

export const RUN_KEY_PERMISSIONS = ["templates:read", "templates:write", "runs:read", "runs:write"] as const;

export type RunKeyPermission = (typeof RUN_KEY_PERMISSIONS)[number];

export const runKeyPermissionSchema = z.enum(RUN_KEY_PERMISSIONS);

export const DEFAULT_RUN_KEY_PERMISSIONS: readonly RunKeyPermission[] = ["templates:read", "runs:read", "runs:write"];

export const RUN_KEY_PERMISSION_DETAILS: Record<RunKeyPermission, { label: string; description: string }> = {
  "templates:read": { label: "Read templates", description: "List and read your personal templates." },
  "templates:write": {
    label: "Write templates",
    description: "Create and edit private personal templates; edits carry into your in-progress runs. Never delete or publish.",
  },
  "runs:read": { label: "Read runs", description: "List and read your personal runs." },
  "runs:write": {
    label: "Write runs",
    description: "Start runs from your templates and update tasks, notes, and status. Needs Read templates.",
  },
};

const IMPLIED_READS: Partial<Record<RunKeyPermission, readonly RunKeyPermission[]>> = {
  "templates:write": ["templates:read"],
  "runs:write": ["runs:read", "templates:read"],
};

export function withImpliedRunKeyPermissions(permissions: Iterable<RunKeyPermission>): RunKeyPermission[] {
  const granted = new Set<RunKeyPermission>(permissions);
  for (const permission of [...granted]) {
    for (const implied of IMPLIED_READS[permission] ?? []) granted.add(implied);
  }
  return RUN_KEY_PERMISSIONS.filter((permission) => granted.has(permission));
}

export function toggleRunKeyPermission(
  current: readonly RunKeyPermission[],
  permission: RunKeyPermission,
  enabled: boolean,
): RunKeyPermission[] {
  if (enabled) return withImpliedRunKeyPermissions([...current, permission]);
  return current.filter((granted) => granted !== permission && !IMPLIED_READS[granted]?.includes(permission));
}

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

import { z } from "zod";

import { normalizePublicHandle, publicHandleSchema } from "../src/lib/schemas/publicHandle";

export const HANDLE_OWNERS_QUERY =
  "SELECT 'user' AS owner_type, id AS owner_id, username AS value FROM users WHERE username IS NOT NULL AND trim(username) <> '' " +
  "UNION ALL SELECT 'team' AS owner_type, id AS owner_id, slug AS value FROM teams WHERE slug IS NOT NULL AND trim(slug) <> '';";

export type HandleCheckTarget = { label: "local" | "staging" | "production"; database: string[] };

export function handleCheckTarget(argv: readonly string[]): HandleCheckTarget {
  if (argv.includes("--production")) return { label: "production", database: ["serp-checklists-db", "--remote"] };
  if (argv.includes("--staging")) return { label: "staging", database: ["DB", "--remote", "--preview"] };
  return { label: "local", database: ["serp-checklists-db", "--local"] };
}

export const handleOwnerSchema = z.object({
  owner_type: z.enum(["user", "team"]),
  owner_id: z.string(),
  value: z.string(),
});

export type HandleOwner = z.infer<typeof handleOwnerSchema>;

type HandleProblems = {
  collisions: { handle: string; owners: HandleOwner[] }[];
  invalid: { owner: HandleOwner; reason: string }[];
};

export function findHandleProblems(owners: readonly HandleOwner[]): HandleProblems {
  const ownersByHandle = new Map<string, HandleOwner[]>();
  for (const owner of owners) {
    const handle = normalizePublicHandle(owner.value);
    ownersByHandle.set(handle, [...(ownersByHandle.get(handle) ?? []), owner]);
  }

  return {
    collisions: [...ownersByHandle]
      .filter(([, holders]) => holders.length > 1)
      .map(([handle, holders]) => ({ handle, owners: holders })),
    invalid: owners.flatMap((owner) => {
      const parsed = publicHandleSchema.safeParse(owner.value);
      return parsed.success ? [] : [{ owner, reason: parsed.error.issues[0]?.message ?? "Not a valid handle." }];
    }),
  };
}

const describeOwner = ({ owner_type, owner_id, value }: HandleOwner) =>
  `${owner_type === "user" ? "User" : "Organization"} ${owner_id} ("${value}")`;

export function formatHandleReport(label: string, ownerCount: number, problems: HandleProblems): string[] {
  const lines = [
    `Public handles on ${label}: ${ownerCount} usernames and Organization slugs checked, ` +
      `${problems.collisions.length} collision(s), ${problems.invalid.length} outside the handle rule.`,
  ];
  for (const { handle, owners } of problems.collisions) {
    lines.push(`Collision on "${handle}": ${owners.map(describeOwner).join(", ")}. Rename all but one by hand before applying 0028.`);
  }
  for (const { owner, reason } of problems.invalid) {
    lines.push(`Outside the handle rule: ${describeOwner(owner)}: ${reason} It is kept and registered as it is.`);
  }
  return lines;
}

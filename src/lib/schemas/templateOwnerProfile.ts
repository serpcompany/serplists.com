export type TemplateOwnerProfile = { username: string | undefined; full_name: string | undefined };

const stringOrUndefined = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export function templateOwnerProfile(row: {
  owner_username?: unknown;
  owner_full_name?: unknown;
}): TemplateOwnerProfile | undefined {
  const username = stringOrUndefined(row.owner_username);
  const fullName = stringOrUndefined(row.owner_full_name);
  return username === undefined && fullName === undefined ? undefined : { username, full_name: fullName };
}

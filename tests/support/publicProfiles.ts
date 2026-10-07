import type { SqliteD1 } from './sqlite-d1';

export const ACME = {
  id: 'org-1',
  handle: 'Acme-Launch',
  name: 'Acme Launch',
  avatarUrl: 'https://serplists.com/api/uploads/file?key=avatars%2Fcreator-1%2Facme.webp',
  description: 'Launch checklists for agencies.',
} as const;

export const ARCHIVED_ORGANIZATION = { id: 'org-archived', handle: 'gone-org', name: 'Gone Org' } as const;

export const CREATOR = { id: 'creator-1', username: 'alice', name: 'Alice Creator' } as const;

export const PERSONAL_OWNER = { id: 'owner-2', username: 'bob', name: 'Bob Owner' } as const;

type StoredTemplate = {
  id: string;
  ownerType?: 'user' | 'team';
  teamId?: string | null;
  userId?: string;
  isPublic?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  category?: string;
};

const ITEMS = JSON.stringify([{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }]);

export function storeProfileTemplate(d1: SqliteD1, template: StoredTemplate) {
  const ownerType = template.ownerType ?? 'user';
  const userId = template.userId ?? (ownerType === 'team' ? CREATOR.id : PERSONAL_OWNER.id);
  d1.run(
    `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
       created_by_user_id, slug, content_version, deleted_at, category)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'checklist', ?, ?, ?, ?, 1, ?, ?)`,
    template.id,
    userId,
    `Template ${template.id}`,
    ITEMS,
    template.isPublic === false ? 0 : 1,
    template.createdAt ?? '2026-02-01',
    ownerType,
    template.teamId ?? (ownerType === 'team' ? ACME.id : null),
    userId,
    template.id,
    template.deletedAt ?? null,
    template.category ?? '["Operations"]',
  );
}

export function seedProfileOwners(d1: SqliteD1) {
  for (const user of [CREATOR, PERSONAL_OWNER]) {
    d1.run(
      `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
      user.id,
      `${user.id}@example.test`,
      user.name,
      user.username,
    );
  }
  d1.run(
    `INSERT INTO teams (id, name, slug, avatar_url, description, billing_owner_user_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01')`,
    ACME.id,
    ACME.name,
    ACME.handle,
    ACME.avatarUrl,
    ACME.description,
    CREATOR.id,
    CREATOR.id,
  );
  d1.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at, archived_at)
     VALUES (?, ?, ?, ?, ?, '2026-01-01', '2026-03-01')`,
    ARCHIVED_ORGANIZATION.id,
    ARCHIVED_ORGANIZATION.name,
    ARCHIVED_ORGANIZATION.handle,
    CREATOR.id,
    CREATOR.id,
  );
  d1.run(
    `INSERT INTO team_members (id, team_id, user_id, role, status, created_at)
     VALUES ('member-1', ?, ?, 'editor', 'active', '2026-01-01')`,
    ACME.id,
    CREATOR.id,
  );
}

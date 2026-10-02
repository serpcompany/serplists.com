import { expect, vi } from "vitest";
import { z } from "zod";
import { SqliteD1 } from "./sqlite-d1";
import { onlyElement } from "./elements";
import { apiEnv } from "./apiEnv";
import { jsonObjects, readJson } from "./readJson";

const sessionMocks = vi.hoisted(() => ({
  userId: "owner-user" as string | null,
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(async () => sessionMocks.userId),
}));

import { handleTeams } from "@functions/api/handlers/teams";

export const createdAt = "2026-01-01T00:00:00.000Z";
export let d1: SqliteD1;

function env() {
  return apiEnv({ DB: d1.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });
}

const teamsApiBody = z.object({
  id: z.string().optional(),
  inviteToken: z.string().optional(),
  code: z.string().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

function sendAs(userId: string, method: string, path: string, body?: unknown) {
  sessionMocks.userId = userId;
  return handleTeams(
    new Request(`http://localhost/api/teams${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env(),
  );
}

export async function asUser(userId: string, method: string, path: string, body?: unknown) {
  const response = await sendAs(userId, method, path, body);
  return { status: response.status, data: await readJson(response, teamsApiBody) };
}

export async function listAsUser(userId: string, path: string) {
  const response = await sendAs(userId, "GET", path);
  return { status: response.status, data: await readJson(response, jsonObjects) };
}

function seedOrganization() {
  const users = [
    ["owner-user", "owner@example.test"],
    ["admin-user", "admin@example.test"],
    ["member-user", "member@example.test"],
    ["other-user", "other@example.test"],
    ["new-user", "new@example.test"],
  ];
  for (const [id, email] of users) {
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)", id, email, id, createdAt);
  }
  d1.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
     VALUES ('team-1', 'Acme', 'acme', 'owner-user', 'owner-user', ?)`,
    createdAt,
  );
  const members = [
    ["owner-member", "owner-user", "owner"],
    ["admin-member", "admin-user", "admin"],
    ["member-m", "member-user", "editor"],
    ["member-x", "other-user", "viewer"],
  ];
  for (const [id, userId, role] of members) {
    d1.run(
      `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
       VALUES (?, 'team-1', ?, ?, 'active', ?, ?, ?)`,
      id, userId, role, createdAt, createdAt, createdAt,
    );
  }
}

export function member(id: string) {
  return d1.rows<{ role: string; status: string }>("SELECT role, status FROM team_members WHERE id = ?", id)[0];
}

export function billingOwner() {
  return onlyElement(d1.rows<{ billing_owner_user_id: string }>("SELECT billing_owner_user_id FROM teams WHERE id = 'team-1'"))
    .billing_owner_user_id;
}

export function auditActions(action: string) {
  return d1.rows("SELECT id FROM audit_events WHERE action = ?", action);
}

function activeOwners() {
  return d1.rows<{ id: string }>(
    "SELECT id FROM team_members WHERE team_id = 'team-1' AND role = 'owner' AND status = 'active'",
  ).map(({ id }) => id);
}

export function openTheSeededOrganization(): void {
  d1 = new SqliteD1();
  seedOrganization();
}

export function expectOneActiveOwnerAndClose(): void {
  expect(activeOwners()).toHaveLength(1);
  d1.sqlite.close();
}

export async function createInvite(inviterUserId: string, email: string, role: string) {
  const created = await asUser(inviterUserId, "POST", "/team-1/invites", { email, role });
  expect(created.status).toBe(200);
  return { id: String(created.data?.id), token: String(created.data?.inviteToken) };
}

export function inviteColumns<T extends Record<string, unknown>>(id: string, columns: string): T {
  return onlyElement(d1.rows<T>(`SELECT ${columns} FROM team_invites WHERE id = ?`, id));
}

export const revocationAndAcceptance = (id: string) =>
  inviteColumns<{ revoked_at: string | null; accepted_at: string | null }>(id, "revoked_at, accepted_at");

export function revokedInviteAudits() {
  return d1.rows<{ resource_id: string; metadata_json: string | null }>(
    "SELECT resource_id, metadata_json FROM audit_events WHERE action = 'team_invite.revoked'",
  );
}

export function newUserMembership() {
  return d1.rows("SELECT role, status FROM team_members WHERE team_id = 'team-1' AND user_id = 'new-user'");
}

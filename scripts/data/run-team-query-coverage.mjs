import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '../../functions/api/db.ts';

const TEST_PASSWORD_HASH =
	"$2b$10$ai6w4pGPSwjTsx8h9eRuHOHz956SooVhr7NpOMxLCB.v4MhZfVnfa";

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

async function dispatchJson(
	mf,
	route,
	{ method = "GET", body, cookie, headers = {}, status = 200 } = {},
) {
	const response = await mf.dispatchFetch(`http://localhost${route}`, {
		method,
		redirect: "manual",
		headers: {
			...(cookie ? { Cookie: cookie } : {}),
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
			...headers,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await response.text();
	assert.equal(
		response.status,
		status,
		`${method} ${route}: ${text.slice(0, 300)}`,
	);
	return { response, json: text ? JSON.parse(text) : null };
}

async function cleanupFixtures(db, { teamIds, userId }) {
	for (const teamId of teamIds) {
		await db.delete(schema.audit_events).where(and(eq(schema.audit_events.subject_type, 'team'), eq(schema.audit_events.subject_id, teamId)));
		await db.delete(schema.team_invites).where(eq(schema.team_invites.team_id, teamId));
		await db.delete(schema.team_members).where(eq(schema.team_members.team_id, teamId));
		await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
	}
	await db.delete(schema.session).where(eq(schema.session.userId, userId));
	await db.delete(schema.account).where(eq(schema.account.userId, userId));
	await db.delete(schema.users).where(eq(schema.users.id, userId));
}

export async function runTeamQueryCoverage({ mf, db }) {
	assert(
		mf && typeof mf.dispatchFetch === "function",
		"A real Miniflare Worker is required",
	);
	const orm = createDb({ DB: db });
	assert(
		db && typeof db.prepare === "function",
		"A migrated local D1 binding is required",
	);

	const nonce = randomUUID().replaceAll("-", "");
	const userId = `team-query-user-${nonce}`;
	const accountId = `team-query-account-${nonce}`;
	const email = `team-query-${nonce}@e2e.local`;
	const teamName = `Team Query Coverage ${nonce.slice(0, 12)}`;
	const baseSlug = slugify(teamName);
	const teamIds = [];

	try {
		const nowMs = Date.now();
		await orm.insert(schema.users).values({ id: userId, email, name: 'Team Query Coverage', username: `team_query_${nonce.slice(0, 16)}`, email_verified: true, created_at: new Date(nowMs).toISOString(), auth_created_at: new Date(nowMs), auth_updated_at: new Date(nowMs) });
		await orm.insert(schema.account).values({ id: accountId, accountId: userId, providerId: 'credential', userId, password: TEST_PASSWORD_HASH, createdAt: new Date(nowMs), updatedAt: new Date(nowMs) });

		const login = await dispatchJson(mf, "/api/auth/sign-in/email", {
			method: "POST",
			body: { email, password: "password123" },
			headers: { Origin: "http://localhost" },
		});
		const setCookies =
			typeof login.response.headers.getSetCookie === "function"
				? login.response.headers.getSetCookie()
				: [login.response.headers.get("set-cookie")].filter(Boolean);
		const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
		assert(
			cookie.includes("session_token"),
			"Sign-in must create a real Better Auth session cookie",
		);

		const firstCreate = await dispatchJson(mf, "/api/teams", {
			method: "POST",
			body: { name: teamName },
			cookie,
		});
		teamIds.push(firstCreate.json.id);
		const secondCreate = await dispatchJson(mf, "/api/teams", {
			method: "POST",
			body: { name: teamName },
			cookie,
		});
		teamIds.push(secondCreate.json.id);

		assert.equal(
			firstCreate.json.slug,
			baseSlug,
			"First same-named team must persist the generated base slug",
		);
		assert.equal(
			secondCreate.json.slug,
			`${baseSlug}-${secondCreate.json.id.slice(0, 8)}`,
			"Second same-named team must persist the collision suffix derived from its team ID",
		);
		assert.notEqual(
			firstCreate.json.slug,
			secondCreate.json.slug,
			"Same-named teams must have distinct slugs",
		);

		const persistedTeams = await orm.select({ id: schema.teams.id, name: schema.teams.name, slug: schema.teams.slug, created_by_user_id: schema.teams.created_by_user_id, billing_owner_user_id: schema.teams.billing_owner_user_id }).from(schema.teams).where(inArray(schema.teams.id, teamIds)).orderBy(schema.teams.id);
		assert.equal(persistedTeams.length, 2);
		assert.deepEqual(
			new Set(persistedTeams.map((team) => team.slug)),
			new Set([baseSlug, `${baseSlug}-${secondCreate.json.id.slice(0, 8)}`]),
		);
		for (const team of persistedTeams) {
			assert.equal(team.name, teamName);
			assert.equal(team.created_by_user_id, userId);
			assert.equal(team.billing_owner_user_id, userId);
		}

		const inviteId = `team-query-invite-${nonce}`;
		const inviteToken = `team-query-token-${nonce}`;
		const inviteTokenHash = createHash("sha256")
			.update(inviteToken)
			.digest("hex");
		const createdAt = new Date().toISOString();
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const protectedTeamId = firstCreate.json.id;
		await orm.insert(schema.team_invites).values({ id: inviteId, team_id: protectedTeamId, email, role: 'viewer', token_hash: inviteTokenHash, invited_by_user_id: userId, expires_at: expiresAt, created_at: createdAt, updated_at: createdAt });

		const [membershipBefore] = await orm.select({ id: schema.team_members.id, role: schema.team_members.role, status: schema.team_members.status }).from(schema.team_members).where(and(eq(schema.team_members.team_id, protectedTeamId), eq(schema.team_members.user_id, userId))).limit(1);
		assert.equal(membershipBefore.role, "owner");
		assert.equal(membershipBefore.status, "active");

		const accepted = await dispatchJson(
			mf,
			`/api/teams/invites/${encodeURIComponent(inviteToken)}/accept`,
			{ method: "POST", cookie },
		);
		assert.equal(accepted.json.teamId, protectedTeamId);
		assert.equal(accepted.json.memberId, membershipBefore.id);
		assert.equal(
			accepted.json.role,
			"owner",
			"A lower-role invite must not demote an already-active owner",
		);
		assert.equal(accepted.json.team.role, "owner");
		assert.equal(accepted.json.team.membershipStatus, "active");

		const [membershipAfter] = await orm.select({ id: schema.team_members.id, role: schema.team_members.role, status: schema.team_members.status }).from(schema.team_members).where(and(eq(schema.team_members.team_id, protectedTeamId), eq(schema.team_members.user_id, userId))).limit(1);
		assert.deepEqual(
			membershipAfter,
			membershipBefore,
			"Invite acceptance must preserve the active owner membership",
		);

		const [protectedTeam] = await orm.select({ created_by_user_id: schema.teams.created_by_user_id, billing_owner_user_id: schema.teams.billing_owner_user_id, archived_at: schema.teams.archived_at }).from(schema.teams).where(eq(schema.teams.id, protectedTeamId)).limit(1);
		assert.equal(protectedTeam.created_by_user_id, userId);
		assert.equal(protectedTeam.billing_owner_user_id, userId);
		assert.equal(protectedTeam.archived_at, null);

		const [persistedInvite] = await orm.select({ role: schema.team_invites.role, accepted_by_user_id: schema.team_invites.accepted_by_user_id, accepted_at: schema.team_invites.accepted_at, revoked_at: schema.team_invites.revoked_at }).from(schema.team_invites).where(eq(schema.team_invites.id, inviteId)).limit(1);
		assert.equal(
			persistedInvite.role,
			"viewer",
			"The invite retains its requested role as immutable history",
		);
		assert.equal(persistedInvite.accepted_by_user_id, userId);
		assert(
			persistedInvite.accepted_at,
			"Accepted invitation must record its acceptance time",
		);
		assert.equal(persistedInvite.revoked_at, null);

		const auditRows = await orm.select().from(schema.audit_events).where(and(eq(schema.audit_events.subject_type, 'team'), eq(schema.audit_events.subject_id, protectedTeamId), eq(schema.audit_events.resource_type, 'team_invite'), eq(schema.audit_events.resource_id, inviteId), eq(schema.audit_events.action, 'team_invite.accepted')));
		assert.equal(
			auditRows.length,
			1,
			"Accepted active-member invite must append exactly one audit event",
		);
		const acceptanceAudit = auditRows[0];
		assert.equal(acceptanceAudit.actor_user_id, userId);
		assert.equal(acceptanceAudit.subject_id, protectedTeamId);
		assert.equal(acceptanceAudit.resource_id, inviteId);
		assert.deepEqual(JSON.parse(acceptanceAudit.after_json), {
			inviteId,
			memberId: membershipBefore.id,
			role: "owner",
		});

		return {
			scenarios: [
				"same-name-team-slug-collision",
				"already-active-owner-invite-acceptance",
			],
			createdTeamCount: 2,
			distinctPersistedSlugCount: 2,
			preservedOwnerRole: true,
			acceptedInviteAuditCount: auditRows.length,
		};
	} finally {
		await cleanupFixtures(orm, { teamIds, userId });
	}
}

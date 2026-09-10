import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

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
		await db
			.prepare(
				"DELETE FROM audit_events WHERE subject_type = ? AND subject_id = ?",
			)
			.bind("team", teamId)
			.run();
		await db
			.prepare("DELETE FROM team_invites WHERE team_id = ?")
			.bind(teamId)
			.run();
		await db
			.prepare("DELETE FROM team_members WHERE team_id = ?")
			.bind(teamId)
			.run();
		await db.prepare("DELETE FROM teams WHERE id = ?").bind(teamId).run();
	}
	await db.prepare("DELETE FROM session WHERE user_id = ?").bind(userId).run();
	await db.prepare("DELETE FROM account WHERE user_id = ?").bind(userId).run();
	await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

export async function runTeamQueryCoverage({ mf, db }) {
	assert(
		mf && typeof mf.dispatchFetch === "function",
		"A real Miniflare Worker is required",
	);
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
		await db
			.prepare(`
      INSERT INTO users (
        id, email, name, username, email_verified, created_at, auth_created_at, auth_updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `)
			.bind(
				userId,
				email,
				"Team Query Coverage",
				`team_query_${nonce.slice(0, 16)}`,
				new Date(nowMs).toISOString(),
				nowMs,
				nowMs,
			)
			.run();
		await db
			.prepare(`
      INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
      VALUES (?, ?, 'credential', ?, ?, ?, ?)
    `)
			.bind(accountId, userId, userId, TEST_PASSWORD_HASH, nowMs, nowMs)
			.run();

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

		const persistedTeams = await db
			.prepare(`
      SELECT id, name, slug, created_by_user_id, billing_owner_user_id
      FROM teams
      WHERE id IN (?, ?)
      ORDER BY id
    `)
			.bind(...teamIds)
			.all();
		assert.equal(persistedTeams.results.length, 2);
		assert.deepEqual(
			new Set(persistedTeams.results.map((team) => team.slug)),
			new Set([baseSlug, `${baseSlug}-${secondCreate.json.id.slice(0, 8)}`]),
		);
		for (const team of persistedTeams.results) {
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
		await db
			.prepare(`
      INSERT INTO team_invites (
        id, team_id, email, role, token_hash, invited_by_user_id,
        accepted_by_user_id, expires_at, accepted_at, revoked_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'viewer', ?, ?, NULL, ?, NULL, NULL, ?, ?)
    `)
			.bind(
				inviteId,
				protectedTeamId,
				email,
				inviteTokenHash,
				userId,
				expiresAt,
				createdAt,
				createdAt,
			)
			.run();

		const membershipBefore = await db
			.prepare(`
      SELECT id, role, status FROM team_members WHERE team_id = ? AND user_id = ?
    `)
			.bind(protectedTeamId, userId)
			.first();
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

		const membershipAfter = await db
			.prepare(`
      SELECT id, role, status FROM team_members WHERE team_id = ? AND user_id = ?
    `)
			.bind(protectedTeamId, userId)
			.first();
		assert.deepEqual(
			membershipAfter,
			membershipBefore,
			"Invite acceptance must preserve the active owner membership",
		);

		const protectedTeam = await db
			.prepare(`
      SELECT created_by_user_id, billing_owner_user_id, archived_at FROM teams WHERE id = ?
    `)
			.bind(protectedTeamId)
			.first();
		assert.equal(protectedTeam.created_by_user_id, userId);
		assert.equal(protectedTeam.billing_owner_user_id, userId);
		assert.equal(protectedTeam.archived_at, null);

		const persistedInvite = await db
			.prepare(`
      SELECT role, accepted_by_user_id, accepted_at, revoked_at FROM team_invites WHERE id = ?
    `)
			.bind(inviteId)
			.first();
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

		const auditRows = await db
			.prepare(`
      SELECT actor_user_id, subject_type, subject_id, resource_type, resource_id, action, after_json
      FROM audit_events
      WHERE subject_type = 'team' AND subject_id = ?
        AND resource_type = 'team_invite' AND resource_id = ?
        AND action = 'team_invite.accepted'
    `)
			.bind(protectedTeamId, inviteId)
			.all();
		assert.equal(
			auditRows.results.length,
			1,
			"Accepted active-member invite must append exactly one audit event",
		);
		const acceptanceAudit = auditRows.results[0];
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
			acceptedInviteAuditCount: auditRows.results.length,
		};
	} finally {
		await cleanupFixtures(db, { teamIds, userId });
	}
}

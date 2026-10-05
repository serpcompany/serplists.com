import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { asUser, auditActions, createdAt, d1, expectOneActiveOwnerAndClose, openTheSeededOrganization } from "../../../support/teamsSqlite";
import { z } from "zod";
import { parseJsonText } from "../../../support/storedJson";

const createdTeamSnapshot = z.object({ team: z.object({ slug: z.unknown() }).passthrough() }).passthrough();

describe("Organization membership writes against SQLite, which leave every Organization one active owner whatever interleaving ran", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  describe("Organization slugs", () => {
    function teamSlugs() {
      return d1.rows<{ slug: string }>("SELECT slug FROM teams ORDER BY created_at, slug").map(({ slug }) => slug);
    }

    it("rejects a requested slug another Organization already uses, even an archived one", async () => {
      const taken = await asUser("new-user", "POST", "", { name: "Acme", slug: "acme" });
      d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt);
      const takenByArchived = await asUser("new-user", "POST", "", { name: "Acme", slug: "acme" });

      expect(taken).toEqual({
        status: 409,
        data: { error: "Organization slug is already in use", code: "team_slug_exists" },
      });
      expect(takenByArchived.status).toBe(409);
      expect(teamSlugs()).toEqual(["acme"]);
      expect(auditActions("team.created")).toHaveLength(0);
      d1.run("UPDATE teams SET archived_at = NULL WHERE id = 'team-1'");
    });

    function insertCompetingTeam(slug: string) {
      d1.run(
        `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
         VALUES ('team-2', 'Competing', ?, 'other-user', 'other-user', ?)`,
        slug,
        createdAt,
      );
    }

    it("retries with a new slug when another request takes the name-derived slug before the write", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("marketing"));

      const created = await asUser("new-user", "POST", "", { name: "Marketing" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^marketing-[0-9a-f]{8}$/);
      const createdAudit = d1.rows<{ after_json: string }>("SELECT after_json FROM audit_events WHERE action = 'team.created'");
      expect(createdAudit.map(({ after_json }) => parseJsonText(after_json, createdTeamSnapshot).team.slug)).toEqual([created.data?.slug]);
      expect(d1.rows("SELECT id FROM team_members WHERE user_id = 'new-user' AND role = 'owner'")).toHaveLength(1);
    });

    it.each([
      ["another Organization", () => insertCompetingTeam("marketing"), ["acme", "marketing"]],
      ["a User, as a username", () => d1.run("UPDATE users SET username = 'marketing' WHERE id = 'other-user'"), ["acme"]],
    ])("returns 409 when %s takes a requested slug before the write, writing nothing", async (_claimant, claim, slugsAfter) => {
      d1.beforeNextBatch(claim);

      const created = await asUser("new-user", "POST", "", { name: "Marketing", slug: "marketing" });

      expect(created.status).toBe(409);
      expect(created.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(slugsAfter);
      expect(auditActions("team.created")).toHaveLength(0);
      expect(d1.rows("SELECT id FROM team_members WHERE user_id = 'new-user'")).toHaveLength(0);
    });

    it("returns 409 when another Organization saves the same new slug before the update writes", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("acme-ops"));

      const updated = await asUser("admin-user", "PUT", "/team-1", { slug: "acme-ops" });

      expect(updated.status).toBe(409);
      expect(updated.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(["acme", "acme-ops"]);
      expect(auditActions("team.updated")).toHaveLength(0);
    });

    it("rejects a requested or changed slug that is a User's username in any case, since Users and Organizations share one handle namespace", async () => {
      d1.run("UPDATE users SET username = 'JaneDoe' WHERE id = 'other-user'");

      const created = await asUser("new-user", "POST", "", { name: "Jane", slug: "janedoe" });
      const updated = await asUser("admin-user", "PUT", "/team-1", { slug: "janedoe" });

      expect([created.status, updated.status]).toEqual([409, 409]);
      expect([created.data?.code, updated.data?.code]).toEqual(["team_slug_exists", "team_slug_exists"]);
      expect(teamSlugs()).toEqual(["acme"]);
      expect(auditActions("team.created")).toHaveLength(0);
      expect(auditActions("team.updated")).toHaveLength(0);
    });

    it("checks a slug with one primary-key lookup in the handle registry, not a scan", async () => {
      await asUser("admin-user", "PUT", "/team-1", { slug: "acme-ops" });

      const lookup = d1.queries.find(({ sql }) => sql.includes('from "public_handles"'));
      assert.exists(lookup);
      expect(d1.queryPlan(lookup).join("\n")).toMatch(/SEARCH public_handles USING INDEX sqlite_autoindex_public_handles_1 \(handle=\?\)/);
    });

    it("suffixes a name-derived slug that is a User's username", async () => {
      d1.run("UPDATE users SET username = 'marketing' WHERE id = 'other-user'");

      const created = await asUser("new-user", "POST", "", { name: "Marketing" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^marketing-[0-9a-f]{8}$/);
    });

    it("suffixes a slug derived from the name when it is taken", async () => {
      const created = await asUser("new-user", "POST", "", { name: "Acme" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^acme-[0-9a-f]{8}$/);
      expect(teamSlugs()).toEqual(["acme", created.data?.slug]);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asUser, auditActions, createdAt, d1, expectOneActiveOwnerAndClose, openTheSeededOrganization } from "../../../support/teamsSqlite";
import { jsonRecordIn } from "../../../support/storedJson";
import { recordIn } from "../../../support/mcpResponses";

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
      expect(createdAudit.map(({ after_json }) => recordIn(jsonRecordIn(after_json).team).slug)).toEqual([created.data?.slug]);
      expect(d1.rows("SELECT id FROM team_members WHERE user_id = 'new-user' AND role = 'owner'")).toHaveLength(1);
    });

    it("returns 409 when another request takes a requested slug before the write", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("marketing"));

      const created = await asUser("new-user", "POST", "", { name: "Marketing", slug: "marketing" });

      expect(created.status).toBe(409);
      expect(created.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(["acme", "marketing"]);
      expect(auditActions("team.created")).toHaveLength(0);
    });

    it("returns 409 when another Organization saves the same new slug before the update writes", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("acme-ops"));

      const updated = await asUser("admin-user", "PUT", "/team-1", { slug: "acme-ops" });

      expect(updated.status).toBe(409);
      expect(updated.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(["acme", "acme-ops"]);
      expect(auditActions("team.updated")).toHaveLength(0);
    });

    it("suffixes a slug derived from the name when it is taken", async () => {
      const created = await asUser("new-user", "POST", "", { name: "Acme" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^acme-[0-9a-f]{8}$/);
      expect(teamSlugs()).toEqual(["acme", created.data?.slug]);
    });
  });
});

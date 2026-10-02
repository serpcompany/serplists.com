import { beforeEach, describe, expect, it } from "vitest";
import { elementAt, firstOf } from "../../../support/elements";
import { z } from "zod";
import { auditMocks, dbMocks, mockEnv, resetTeamsHandlerMocks, sessionMocks, teamMember } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { anyInstanceOf, objectContaining } from "../../../support/asymmetricMatchers";

const teamBody = z.object({ slug: z.string(), role: z.unknown() }).passthrough();
const createdTeamAudit = z.object({ team: z.object({ slug: z.string() }).passthrough() }).passthrough();

const createRequest = (body: unknown) => new Request("http://localhost/api/teams", { method: "POST", body: JSON.stringify(body) });

const createTeam = (body: unknown) => handleTeams(createRequest(body), mockEnv);

async function expectTheSlugIsTaken(response: Response) {
  const data = await response.json();

  expect(response.status).toBe(409);
  expect(data).toEqual({ error: "Organization slug is already in use", code: "team_slug_exists" });
}

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("rejects unauthenticated access", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);

    const response = await handleTeams(new Request("http://localhost/api/teams"), mockEnv);

    expect(response.status).toBe(401);
  });

  it("creates a team and owner membership", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await createTeam({ name: "Acme Team" });
    const data = await readJson(response, teamBody);

    expect(response.status).toBe(200);
    expect(data).toEqual(
      objectContaining({
        memberId: anyInstanceOf(String),
        membershipStatus: "active",
        name: "Acme Team",
      }),
    );
    expect(data.slug).toBe("acme-team");
    expect(data.role).toBe("owner");

    const insertedTeam = firstOf(dbMocks.insertChain.values.mock.calls)[0];
    const insertedMembership = elementAt(dbMocks.insertChain.values.mock.calls, 1)[0];
    expect(insertedTeam.name).toBe("Acme Team");
    expect(insertedTeam.billing_owner_user_id).toBe("user-1");
    expect(insertedMembership.role).toBe("owner");
    expect(insertedMembership.user_id).toBe("user-1");
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      objectContaining({
        actorUserId: "user-1",
        action: "team.created",
      }),
    );
  });

  it("folds the accented letters of an Organization name into its slug", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await createTeam({ name: "Équipe Café Straße" });
    const data = await readJson(response, teamBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe("equipe-cafe-strasse");
  });

  it("rejects team creation with an explicitly requested slug that is taken", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "other-team" }]);

    await expectTheSlugIsTaken(await createTeam({ name: "Acme", slug: "acme" }));
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("creates a team with an explicitly requested free slug unchanged", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await createTeam({ name: "Acme", slug: "acme" });
    const data = await readJson(response, teamBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe("acme");
    expect(firstOf(dbMocks.insertChain.values.mock.calls)[0].slug).toBe("acme");
  });

  it("suffixes a name-derived slug that is taken", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "other-team" }]).mockResolvedValueOnce([]);

    const response = await createTeam({ name: "Acme" });
    const data = await readJson(response, teamBody);

    expect(response.status).toBe(200);
    expect(data.slug).toMatch(/^acme-[0-9a-f]{8}$/);
    expect(firstOf(dbMocks.insertChain.values.mock.calls)[0].slug).toBe(data.slug);
  });

  describe("slug races between the check and the write", () => {
    const slugViolation = () => new Error("D1_ERROR: UNIQUE constraint failed: teams.slug: SQLITE_CONSTRAINT");

    function createdAuditSlugs() {
      return auditMocks.buildAuditEventValues.mock.calls
        .map(([input]) => input)
        .filter((input) => input.action === "team.created")
        .map((input) => createdTeamAudit.parse(input.after).team.slug);
    }

    it("retries a name-derived slug that another request took and records the slug it wrote", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation()).mockResolvedValueOnce([]);

      const response = await createTeam({ name: "Marketing" });
      const data = await readJson(response, teamBody);

      expect(response.status).toBe(200);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(2);
      expect(data.slug).toMatch(/^marketing-[0-9a-f]{8}$/);
      const insertedTeams = dbMocks.insertChain.values.mock.calls
        .map(([values]) => values)
        .filter((values) => "billing_owner_user_id" in values);
      expect(insertedTeams.map((team) => team.slug)).toEqual(["marketing", data.slug]);
      expect(createdAuditSlugs()).toEqual(["marketing", data.slug]);
    });

    it("gives up with a 409 after a bounded number of slug collisions", async () => {
      dbMocks.db.batch.mockRejectedValue(slugViolation());

      const response = await createTeam({ name: "Marketing" });
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(409);
      expect(data.code).toBe("team_slug_exists");
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(3);
    });

    it("returns 409 without retrying when a requested slug is taken between the check and the write", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      await expectTheSlugIsTaken(await createTeam({ name: "Marketing", slug: "marketing" }));
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["another unique index", "D1_ERROR: UNIQUE constraint failed: team_members.team_id, team_members.user_id"],
      ["a similarly named column", "D1_ERROR: UNIQUE constraint failed: teams.slug_history"],
      ["any other failure", "D1_ERROR: database is locked"],
    ])("rethrows %s instead of treating it as a slug conflict", async (_label, message) => {
      dbMocks.db.batch.mockRejectedValueOnce(new Error(message));

      await expect(handleTeams(createRequest({ name: "Marketing" }), mockEnv)).rejects.toThrow(message);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    });

    it("recognizes the slug conflict when it is wrapped as the cause of another error", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(new Error("Failed query", { cause: slugViolation() }));

      const response = await createTeam({ name: "Marketing", slug: "marketing" });

      expect(response.status).toBe(409);
    });

    function updateRequest(body: { name?: string; slug?: string }) {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([teamMember("admin")])
        .mockResolvedValueOnce([{ id: "team-1", name: "Old Team", slug: "old-team", archived_at: null }]);
      if (body.slug) {
        const organizationsWithTheSlugWhenChecked: never[] = [];
        dbMocks.selectChain.limit.mockResolvedValueOnce(organizationsWithTheSlugWhenChecked);
      }
      return new Request("http://localhost/api/teams/team-1", { method: "PUT", body: JSON.stringify(body) });
    }

    it("returns 409 when another Organization saves the same new slug first", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      await expectTheSlugIsTaken(await handleTeams(updateRequest({ slug: "new-team" }), mockEnv));
    });

    it("rethrows a slug error from an update that did not change the slug", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      await expect(handleTeams(updateRequest({ name: "New Team" }), mockEnv)).rejects.toThrow("teams.slug");
    });
  });

  it("keeps a colliding Organization slug within 120 characters", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "other-team" }]).mockResolvedValueOnce([]);

    const response = await createTeam({ name: "a".repeat(120) });
    const data = await readJson(response, teamBody);

    expect(response.status).toBe(200);
    expect(data.slug.length).toBeLessThanOrEqual(120);
    expect(data.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

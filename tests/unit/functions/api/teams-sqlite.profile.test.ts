import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asUser, auditActions, d1, expectOneActiveOwnerAndClose, listAsUser, openTheSeededOrganization } from "../../../support/teamsSqlite";

const UPLOADED_AVATAR = "http://localhost/api/uploads/file?key=avatars%2Fadmin-user%2Flogo.png";

const profile = () =>
  d1.rows<{ avatar_url: string | null; description: string | null }>("SELECT avatar_url, description FROM teams WHERE id = 'team-1'")[0];

describe("an Organization's avatar and description, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("saves a trimmed description and an uploaded avatar, shows both in the Organization list, and records the change", async () => {
    const saved = await asUser("admin-user", "PUT", "/team-1", { description: "  Paid search agency  ", avatar_url: UPLOADED_AVATAR });
    const listed = await listAsUser("member-user", "");

    expect(saved.status).toBe(200);
    expect(profile()).toEqual({ avatar_url: UPLOADED_AVATAR, description: "Paid search agency" });
    expect(listed.data?.[0]).toMatchObject({ avatar_url: UPLOADED_AVATAR, description: "Paid search agency" });
    expect(auditActions("team.updated")).toHaveLength(1);
  });

  it("clears the description with an empty one and the avatar with null, and writes nothing when neither changes", async () => {
    await asUser("admin-user", "PUT", "/team-1", { description: "Paid search agency", avatar_url: UPLOADED_AVATAR });

    await asUser("admin-user", "PUT", "/team-1", { description: "   ", avatar_url: null });
    const unchanged = await asUser("admin-user", "PUT", "/team-1", { description: "", avatar_url: null });

    expect(unchanged.status).toBe(200);
    expect(profile()).toEqual({ avatar_url: null, description: null });
    expect(auditActions("team.updated")).toHaveLength(2);
  });

  it("refuses an avatar hosted anywhere but SERP Lists' uploads, and a description over 500 characters, saving neither", async () => {
    const elsewhere = await asUser("admin-user", "PUT", "/team-1", { avatar_url: "https://example.com/logo.png" });
    const tooLong = await asUser("admin-user", "PUT", "/team-1", { description: "x".repeat(501) });

    expect([elsewhere.status, tooLong.status]).toEqual([400, 400]);
    expect(profile()).toEqual({ avatar_url: null, description: null });
    expect(auditActions("team.updated")).toHaveLength(0);
  });

  it("lets only owners and admins change them", async () => {
    const asEditor = await asUser("member-user", "PUT", "/team-1", { description: "Taken over" });

    expect(asEditor.status).toBe(403);
    expect(profile()).toEqual({ avatar_url: null, description: null });
  });
});

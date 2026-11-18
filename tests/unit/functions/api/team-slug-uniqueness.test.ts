import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@functions/api/db";
import { generateUniqueTeamSlug, isTeamSlugTaken } from "@functions/api/utils/team-slug";
import { apiEnvOn } from "../../../support/apiEnv";
import { SqliteD1 } from "../../../support/sqlite-d1";

const PUBLIC_HANDLES = "CREATE TABLE public_handles (handle TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL)";

let d1: SqliteD1;

function holdHandle(handle: string, ownerType: "user" | "team", ownerId: string) {
  d1.sqlite.prepare("INSERT INTO public_handles (handle, owner_type, owner_id, created_at) VALUES (?, ?, ?, '2026-01-01')").run(handle, ownerType, ownerId);
}

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: [PUBLIC_HANDLES] });
});

afterEach(() => {
  d1.close();
});

describe("generateUniqueTeamSlug", () => {
  it("keeps the base when no one holds it", async () => {
    await expect(generateUniqueTeamSlug(createDb(apiEnvOn(d1)), "acme", "12345678-team")).resolves.toBe("acme");
  });

  it("suffixes the Organization id when a user holds the base", async () => {
    holdHandle("acme", "user", "user-1");

    await expect(generateUniqueTeamSlug(createDb(apiEnvOn(d1)), "acme", "12345678-team")).resolves.toBe("acme-12345678");
  });

  it("falls back to a random suffix when the id-suffixed slug is taken too", async () => {
    holdHandle("acme", "user", "user-1");
    holdHandle("acme-12345678", "team", "other-team");

    const slug = await generateUniqueTeamSlug(createDb(apiEnvOn(d1)), "acme", "12345678-team");

    expect(slug).toMatch(/^acme-[0-9a-f]{8}$/);
    expect(slug).not.toBe("acme-12345678");
  });
});

describe("isTeamSlugTaken", () => {
  it("does not count the Organization's own handle against it, whatever its casing", async () => {
    holdHandle("acme", "team", "team-1");
    const db = createDb(apiEnvOn(d1));

    await expect(isTeamSlugTaken(db, "Acme", "team-1")).resolves.toBe(false);
    await expect(isTeamSlugTaken(db, "Acme", "team-2")).resolves.toBe(true);
  });
});

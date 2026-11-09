import { describe, expect, it } from "vitest";
import { getRunSubject } from "@functions/api/utils/checklist-runs";
import { canViewTemplate, getTemplateSubject } from "@functions/api/utils/template-permissions";
import { apiEnv, d1ThatRunsNoQuery } from "../../../support/apiEnv";

describe("the subject a run's audit events are recorded under", () => {
  it("is the Organization of an Organization run", () => {
    expect(getRunSubject({ team_id: "team-1", user_id: "user-1" }, "user-2")).toEqual({ type: "team", id: "team-1" });
  });

  it("is the owner of a Personal run", () => {
    expect(getRunSubject({ team_id: null, user_id: "user-1" }, "user-2")).toEqual({ type: "user", id: "user-1" });
  });

  it("is the acting user for a stored run that names no owner", () => {
    expect(getRunSubject({ team_id: null, user_id: "" }, "user-2")).toEqual({ type: "user", id: "user-2" });
  });
});

describe("the subject a Template's audit events are recorded under", () => {
  it("is the Organization of an Organization Template", () => {
    expect(getTemplateSubject({ owner_type: "team", team_id: "team-1", user_id: "user-1" }, "user-2"))
      .toEqual({ type: "team", id: "team-1" });
  });

  it("is the Creator of a Template marked as an Organization's that names no Organization", () => {
    expect(getTemplateSubject({ owner_type: "team", team_id: null, user_id: "user-1" }, "user-2"))
      .toEqual({ type: "user", id: "user-1" });
  });

  it("is the acting user for a stored Template that names no owner", () => {
    expect(getTemplateSubject({ owner_type: "user", team_id: null, user_id: "" }, "user-2"))
      .toEqual({ type: "user", id: "user-2" });
  });
});

describe("canViewTemplate for a visitor who isn't signed in", () => {
  const template = { owner_type: "user", team_id: null, user_id: "user-1", deleted_at: null } as const;
  const env = apiEnv({ DB: d1ThatRunsNoQuery() });

  it("shows a public Template", async () => {
    expect(await canViewTemplate(env, { ...template, is_public: true }, null)).toBe(true);
  });

  it("hides a private Template without looking up who may see it", async () => {
    expect(await canViewTemplate(env, { ...template, is_public: false }, null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getRunSubject } from "@functions/api/utils/checklist-runs";
import { getTemplateSubject } from "@functions/api/utils/template-permissions";

describe("the subject a run's audit events are recorded under", () => {
  it("is the Organization of an Organization run", () => {
    expect(getRunSubject({ team_id: "team-1", user_id: "user-1" })).toEqual({ type: "team", id: "team-1" });
  });

  it("is the owner of a Personal run", () => {
    expect(getRunSubject({ team_id: null, user_id: "user-1" })).toEqual({ type: "user", id: "user-1" });
  });
});

describe("the subject a Template's audit events are recorded under", () => {
  it("is the Organization of an Organization Template", () => {
    expect(getTemplateSubject({ owner_type: "team", team_id: "team-1", user_id: "user-1" })).toEqual({ type: "team", id: "team-1" });
  });

  it("is the Creator of a Template marked as an Organization's that names no Organization", () => {
    expect(getTemplateSubject({ owner_type: "team", team_id: null, user_id: "user-1" })).toEqual({ type: "user", id: "user-1" });
  });
});

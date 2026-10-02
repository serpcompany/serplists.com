import { describe, expect, it } from "vitest";

import {
  countContextTemplates,
  findOtherContextDraft,
  isTemplateLimitReached,
  ORGANIZATION_TEMPLATE_PLAN_MESSAGE,
  resolveTemplateLimitNotice,
  resolveTemplateSaveFailureNotice,
  shouldLoadTemplateCountForLimit,
} from "@/features/template-editor/templateEditorAccess";
import { BILLING_UNAVAILABLE_MESSAGE } from "@/lib/api-errors";
import type { ChecklistTemplate } from "@/types/checklist";

const LIMIT_MESSAGE = "Template limit reached. Upgrade to create more templates.";
const personal = { isOrganization: false, billingEnabled: true };

describe("resolveTemplateSaveFailureNotice", () => {
  it("offers Personal checkout when a save hits the plan limit", () => {
    expect(
      resolveTemplateSaveFailureNotice(
        { kind: "upgrade_required", message: LIMIT_MESSAGE },
        personal,
      ),
    ).toEqual(expect.objectContaining({ action: "checkout", message: LIMIT_MESSAGE }));
  });

  it("never offers Personal checkout inside an Organization, whose limits it cannot lift", () => {
    const notice = resolveTemplateSaveFailureNotice(
      { kind: "upgrade_required", message: LIMIT_MESSAGE },
      { isOrganization: true, billingEnabled: true },
    );

    expect(notice).toEqual(
      expect.objectContaining({ action: null, message: ORGANIZATION_TEMPLATE_PLAN_MESSAGE }),
    );
  });

  it("says checkout is unavailable when billing is off", () => {
    const notice = resolveTemplateSaveFailureNotice(
      { kind: "upgrade_required", message: LIMIT_MESSAGE },
      { isOrganization: false, billingEnabled: false },
    );

    expect(notice?.action).toBeNull();
    expect(notice?.message).toContain(BILLING_UNAVAILABLE_MESSAGE);
  });

  it("offers sign-in when the session ended", () => {
    expect(
      resolveTemplateSaveFailureNotice(
        { kind: "auth_required", message: "Sign in to continue." },
        personal,
      )?.action,
    ).toBe("sign_in");
  });

  it("leaves other failures to the error list", () => {
    expect(
      resolveTemplateSaveFailureNotice({ kind: "error", message: "Boom" }, personal),
    ).toBeNull();
    expect(resolveTemplateSaveFailureNotice(undefined, personal)).toBeNull();
  });
});

describe("template limit pre-check", () => {
  const template = (overrides: Partial<ChecklistTemplate>): ChecklistTemplate =>
    ({ id: "t", title: "T", sections: [], ...overrides }) as ChecklistTemplate;

  it("counts only the active context's own templates", () => {
    const templates = [
      template({ id: "mine", userId: "u1" }),
      template({ id: "org", userId: "u1", teamId: "team-1" }),
      template({ id: "public", userId: "someone-else" }),
    ];

    expect(countContextTemplates(templates, { userId: "u1" })).toBe(1);
    expect(countContextTemplates(templates, { userId: "u1", teamId: "team-1" })).toBe(1);
  });

  it("is reached only when the known count meets a known limit", () => {
    expect(isTemplateLimitReached({ maxTemplates: 1, ownedCount: 1 })).toBe(true);
    expect(isTemplateLimitReached({ maxTemplates: 1, ownedCount: 0 })).toBe(false);
    expect(isTemplateLimitReached({ maxTemplates: null, ownedCount: 40 })).toBe(false);
  });

  it("is never reached while billing or the list is still loading, leaving the API check authoritative", () => {
    expect(isTemplateLimitReached({ maxTemplates: undefined, ownedCount: 1 })).toBe(false);
    expect(isTemplateLimitReached({ maxTemplates: 1, ownedCount: undefined })).toBe(false);
  });

  it("warns before the user writes a template the plan cannot save", () => {
    expect(resolveTemplateLimitNotice(true, personal)?.action).toBe("checkout");
    expect(resolveTemplateLimitNotice(false, personal)).toBeNull();
  });

  it("loads the workspace list, every template with its items, only on the new-template editor of a limited plan", () => {
    expect(shouldLoadTemplateCountForLimit({ isCreate: true, maxTemplates: 1 })).toBe(true);
    expect(shouldLoadTemplateCountForLimit({ isCreate: false, maxTemplates: 1 })).toBe(false);
    expect(shouldLoadTemplateCountForLimit({ isCreate: true, maxTemplates: null })).toBe(false);
    expect(shouldLoadTemplateCountForLimit({ isCreate: true, maxTemplates: undefined })).toBe(false);
  });
});

describe("findOtherContextDraft, for a tab that a confirmed sign-out returned to Personal with a draft kept in an Organization", () => {
  const orgDraft = { teamId: "org-1", savedAt: "2026-09-28T11:00:00.000Z" };
  const personalDraft = { teamId: null, savedAt: "2026-09-28T10:00:00.000Z" };
  const canCreateIn = (teamId: string | null) => teamId === null || teamId === "org-1";

  it("offers a draft kept in an Organization the user can still create templates in", () => {
    expect(
      findOtherContextDraft([orgDraft], { activeTeamId: undefined, workspaceReady: true, canCreateIn }),
    ).toBe(orgDraft);
  });

  it("offers nothing for an Organization the user left or can no longer edit in", () => {
    expect(
      findOtherContextDraft([{ ...orgDraft, teamId: "org-2" }], {
        activeTeamId: undefined,
        workspaceReady: true,
        canCreateIn,
      }),
    ).toBeNull();
  });

  it("decides nothing while the Organization list is loading, since the tab may be about to move into the stored Organization", () => {
    expect(
      findOtherContextDraft([orgDraft], { activeTeamId: undefined, workspaceReady: false, canCreateIn }),
    ).toBeNull();
  });

  it("offers a Personal draft from an Organization, and never the active context's own", () => {
    expect(
      findOtherContextDraft([orgDraft, personalDraft], { activeTeamId: "org-1", workspaceReady: true, canCreateIn }),
    ).toBe(personalDraft);
    expect(
      findOtherContextDraft([personalDraft], { activeTeamId: undefined, workspaceReady: true, canCreateIn }),
    ).toBeNull();
  });

  it("offers the first (newest) draft that can be restored", () => {
    const olderOrgDraft = { ...orgDraft, savedAt: "2026-09-28T09:00:00.000Z" };
    expect(
      findOtherContextDraft([{ ...orgDraft, teamId: "org-2" }, olderOrgDraft], {
        activeTeamId: undefined,
        workspaceReady: true,
        canCreateIn,
      }),
    ).toBe(olderOrgDraft);
  });
});

import { describe, expect, it } from "vitest";

import {
  countContextTemplates,
  isTemplateLimitReached,
  ORGANIZATION_TEMPLATE_PLAN_MESSAGE,
  resolveTemplateLimitNotice,
  resolveTemplateSaveFailureNotice,
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

  // A Personal Pro checkout cannot lift an Organization's limits.
  it("never offers Personal checkout inside an Organization", () => {
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
    // Billing or the list still loading never blocks: the API check stays authoritative.
    expect(isTemplateLimitReached({ maxTemplates: undefined, ownedCount: 1 })).toBe(false);
    expect(isTemplateLimitReached({ maxTemplates: 1, ownedCount: undefined })).toBe(false);
  });

  it("warns before the user writes a template the plan cannot save", () => {
    expect(resolveTemplateLimitNotice(true, personal)?.action).toBe("checkout");
    expect(resolveTemplateLimitNotice(false, personal)).toBeNull();
  });
});

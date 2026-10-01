import { describe, expect, it } from "vitest";
import type { ChecklistTemplate } from "@/types/checklist";
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  findPublicTemplateByIdentifier,
  mergeAccountTemplateCollections,
  mergePublicTemplateCollections,
} from "@/lib/repoTemplateCatalog";

describe("repo template catalog", () => {
  describe("when a D1 template has a bundled starter's slug", () => {
    const starter: ChecklistTemplate = {
      id: "repo:camping-checklist-001",
      title: "Ultimate Camping Checklist",
      description: "",
      sections: [],
      userId: REPO_TEMPLATE_USER_ID,
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
      isPublic: true,
      slug: "ultimate-camping-checklist",
      categories: [],
      tags: [],
      version: 1,
      ownerProfile: { full_name: REPO_TEMPLATE_OWNER_NAME, username: REPO_TEMPLATE_OWNER_SLUG },
    };
    const d1Template = (id: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
      ...starter,
      id,
      title: `Template ${id}`,
      userId: "user-1",
      ownerProfile: { full_name: "Alice", username: "alice" },
      ...overrides,
    });

    it("keeps another owner's public template next to the starter", () => {
      const merged = mergePublicTemplateCollections([starter], [d1Template("alice-camping")]);

      expect(merged.map((template) => template.id)).toEqual([starter.id, "alice-camping"]);
    });

    it("collapses an official SERP copy into the bundled starter", () => {
      const officialCopy = d1Template("official-camping", {
        userId: "serp-user",
        ownerProfile: { full_name: "SERP Lists", username: "SERP" },
      });

      const merged = mergePublicTemplateCollections([starter], [officialCopy]);

      expect(merged).toEqual([starter]);
    });

    it("keeps templates whose owner is unknown, even when their slugs match", () => {
      const ownerless = { ownerProfile: undefined };
      const merged = mergePublicTemplateCollections(
        [],
        [d1Template("first", ownerless), d1Template("second", ownerless)],
      );

      expect(merged.map((template) => template.id)).toEqual(["first", "second"]);
    });

    it("finds the template of the owner the URL names", () => {
      const merged = mergePublicTemplateCollections([starter], [d1Template("alice-camping")]);

      expect(findPublicTemplateByIdentifier(merged, "ultimate-camping-checklist", "Alice")?.id).toBe(
        "alice-camping",
      );
      expect(findPublicTemplateByIdentifier(merged, "ultimate-camping-checklist", "serp")?.id).toBe(starter.id);
      expect(findPublicTemplateByIdentifier(merged, "ultimate-camping-checklist", "bob")).toBeUndefined();
    });
  });

  it("finds public templates by slug or id", () => {
    const templates = mergePublicTemplateCollections([
      {
        id: "repo:camping-checklist-001",
        title: "Ultimate Camping Checklist",
        description: "",
        sections: [],
        userId: REPO_TEMPLATE_USER_ID,
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
        isPublic: true,
        slug: "ultimate-camping-checklist",
        categories: [],
        tags: [],
        version: 1,
        ownerProfile: {
          full_name: REPO_TEMPLATE_OWNER_NAME,
          username: REPO_TEMPLATE_OWNER_SLUG,
        },
      },
    ], []);

    expect(findPublicTemplateByIdentifier(templates, "ultimate-camping-checklist")?.id).toBe(
      "repo:camping-checklist-001",
    );
    expect(findPublicTemplateByIdentifier(templates, "repo:camping-checklist-001")?.slug).toBe(
      "ultimate-camping-checklist",
    );
  });

  it("keeps user-owned private templates in the account collection", () => {
    const accountTemplates = mergeAccountTemplateCollections(
      [
        {
          id: "repo:camping-checklist-001",
          title: "Ultimate Camping Checklist",
          description: "",
          sections: [],
          userId: REPO_TEMPLATE_USER_ID,
          createdAt: "2026-03-22T00:00:00.000Z",
          updatedAt: "2026-03-22T00:00:00.000Z",
          isPublic: true,
          slug: "ultimate-camping-checklist",
          categories: [],
          tags: [],
          version: 1,
          ownerProfile: {
            full_name: REPO_TEMPLATE_OWNER_NAME,
            username: REPO_TEMPLATE_OWNER_SLUG,
          },
        },
      ],
      [
        {
          id: "user-template-1",
          title: "Private Imported Template",
          description: "",
          sections: [],
          userId: "user-1",
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
          isPublic: false,
          slug: "private-imported-template",
          categories: [],
          tags: [],
          version: 1,
        },
      ],
      "user-1",
    );

    expect(accountTemplates.map((template) => template.id)).toContain("user-template-1");
    expect(
      accountTemplates.find((template) => template.id === "user-template-1")?.isPublic,
    ).toBe(false);
  });

  it("does not duplicate user-owned public templates already present in the public collection", () => {
    const accountTemplates = mergeAccountTemplateCollections(
      [
        {
          id: "user-template-2",
          title: "User Public Template",
          description: "",
          sections: [],
          userId: "user-1",
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
          isPublic: true,
          slug: "user-public-template",
          categories: [],
          tags: [],
          version: 1,
        },
      ],
      [
        {
          id: "user-template-2",
          title: "User Public Template",
          description: "",
          sections: [],
          userId: "user-1",
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
          isPublic: true,
          slug: "user-public-template",
          categories: [],
          tags: [],
          version: 1,
        },
      ],
      "user-1",
    );

    expect(accountTemplates.filter((template) => template.id === "user-template-2")).toHaveLength(1);
  });

  it("prefers the user's own copy over a cached catalog copy without reordering", () => {
    const template = (id: string, title: string, version: number) => ({
      id,
      title,
      description: "",
      sections: [],
      userId: "user-1",
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isPublic: true,
      slug: id,
      categories: [],
      tags: [],
      version,
    });
    const accountTemplates = mergeAccountTemplateCollections(
      [template("first", "Cached title", 1), template("second", "Second", 1)],
      [template("first", "Edited title", 2), template("second", "Second", 1)],
      "user-1",
    );

    expect(accountTemplates.map((entry) => [entry.id, entry.title])).toEqual([
      ["first", "Edited title"],
      ["second", "Second"],
    ]);
  });

  describe("when the user's own list has loaded", () => {
    const template = (id: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
      id,
      title: id,
      description: "",
      sections: [],
      userId: "user-1",
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isPublic: true,
      slug: id,
      categories: [],
      tags: [],
      version: 1,
      ...overrides,
    });
    const ids = (templates: ChecklistTemplate[]) => templates.map((entry) => entry.id);

    it("drops a cached catalog copy of a Personal template the user deleted", () => {
      const catalog = [template("deleted"), template("kept")];

      expect(ids(mergeAccountTemplateCollections(catalog, [template("kept")], "user-1"))).toEqual(["kept"]);
      expect(ids(mergeAccountTemplateCollections([template("deleted")], [], "user-1"))).toEqual([]);
    });

    it("keeps other users' public templates, repo templates, and the user's Organization templates", () => {
      const catalog = [
        template("someone-else", { userId: "user-2" }),
        template("repo:camping", { userId: REPO_TEMPLATE_USER_ID }),
        template("org-template", { teamId: "team-1" }),
      ];

      expect(ids(mergeAccountTemplateCollections(catalog, [], "user-1"))).toEqual([
        "someone-else",
        "repo:camping",
        "org-template",
      ]);
    });

    it("uses the owned copy when a public template was made private, and adds private ones", () => {
      const merged = mergeAccountTemplateCollections(
        [template("was-public")],
        [template("was-public", { isPublic: false }), template("private", { isPublic: false })],
        "user-1",
      );

      expect(merged.map((entry) => [entry.id, entry.isPublic])).toEqual([
        ["was-public", false],
        ["private", false],
      ]);
    });

    it("keeps the catalog copies until the user's own list has loaded", () => {
      expect(ids(mergeAccountTemplateCollections([template("mine")], undefined, "user-1"))).toEqual(["mine"]);
    });
  });
});

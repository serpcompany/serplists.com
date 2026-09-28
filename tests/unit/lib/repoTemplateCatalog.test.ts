import { describe, expect, it } from "vitest";
import type { ChecklistTemplate } from "@/types/checklist";
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from "@/lib/schemas/checklistSchema";
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
  mergeAccountTemplateCollections,
  mergePublicTemplateCollections,
  normalizeRepoTemplateSources,
} from "@/lib/repoTemplateCatalog";

describe("repo template catalog", () => {
  it("assigns repo templates to the SERP library profile", () => {
    expect(REPO_TEMPLATE_OWNER_SLUG).toBe("serp");
    expect(REPO_TEMPLATE_OWNER_NAME).toBe("SERP Lists Library");
  });

  it("normalizes backup-style JSON sources into public repo templates", () => {
    const templates = normalizeRepoTemplateSources({
      "../docs/schema/camping-checklist.json": {
        default: {
          version: "1.0.0",
          exportedAt: "2026-03-22T00:00:00.000Z",
          templates: [
            {
              id: "camping-checklist-001",
              title: "Ultimate Camping Checklist",
              description: "Pack smarter for your next trip.",
              userId: "example-user",
              createdAt: "2026-03-22T00:00:00.000Z",
              updatedAt: "2026-03-22T00:00:00.000Z",
              isPublic: true,
              slug: "ultimate-camping-checklist",
              categories: ["outdoor"],
              tags: ["camping"],
              sections: [
                {
                  id: "section-1",
                  title: "Shelter",
                  items: [{ id: "item-1", title: "Pack the tent" }],
                },
              ],
            },
          ],
        },
      },
    });

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      id: "repo:camping-checklist-001",
      slug: "ultimate-camping-checklist",
      isPublic: true,
      userId: REPO_TEMPLATE_USER_ID,
      ownerProfile: {
        full_name: REPO_TEMPLATE_OWNER_NAME,
        username: REPO_TEMPLATE_OWNER_SLUG,
      },
    });
    expect(isRepoTemplate(templates[0])).toBe(true);
  });

  it("accepts portable template pack sources", () => {
    const templates = normalizeRepoTemplateSources({
      "../docs/schema/portable-checklist.json": {
        default: {
          kind: "serplists-template-pack",
          schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
          exportedAt: "2026-03-22T00:00:00.000Z",
          templates: [
            {
              title: "Portable Checklist",
              type: "checklist",
              slug: "portable-checklist",
              visibility: "public",
              categories: ["ops"],
              tags: ["portable"],
              sections: [
                {
                  title: "Prep",
                  items: [{ title: "Review checklist" }],
                },
              ],
            },
          ],
        },
      },
    });

    expect(templates).toHaveLength(1);
    expect(templates[0].title).toBe("Portable Checklist");
    expect(templates[0].slug).toBe("portable-checklist");
    expect(templates[0].isPublic).toBe(true);
    expect(templates[0].userId).toBe(REPO_TEMPLATE_USER_ID);
  });

  it("builds a private copy payload from a repo template", () => {
    const [template] = normalizeRepoTemplateSources({
      "../docs/schema/portable-checklist.json": {
        default: {
          kind: "serplists-template-pack",
          schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
          exportedAt: "2026-03-22T00:00:00.000Z",
          templates: [
            {
              title: "Portable Checklist",
              type: "checklist",
              slug: "portable-checklist",
              visibility: "public",
              categories: ["ops"],
              tags: ["portable"],
              sections: [
                {
                  title: "Prep",
                  items: [{ title: "Review checklist" }],
                },
              ],
            },
          ],
        },
      },
    });

    const payload = buildRepoTemplateCreatePayload(template);

    expect(payload).toMatchObject({
      title: "Portable Checklist",
      type: "checklist",
      seoUrl: "portable-checklist",
      isPublic: false,
      categories: ["ops"],
      tags: ["portable"],
    });
    expect(payload.sections).toEqual(template.sections);
  });

  it("prefers repo templates when public slugs collide", () => {
    const [repoTemplate] = normalizeRepoTemplateSources({
      "../docs/schema/camping-checklist.json": {
        default: {
          version: "1.0.0",
          exportedAt: "2026-03-22T00:00:00.000Z",
          templates: [
            {
              id: "camping-checklist-001",
              title: "Ultimate Camping Checklist",
              userId: "example-user",
              createdAt: "2026-03-22T00:00:00.000Z",
              updatedAt: "2026-03-22T00:00:00.000Z",
              isPublic: true,
              slug: "shared-slug",
              sections: [
                {
                  id: "section-1",
                  title: "Shelter",
                  items: [{ id: "item-1", title: "Pack the tent" }],
                },
              ],
            },
          ],
        },
      },
    });

    const merged = mergePublicTemplateCollections([
      {
        ...repoTemplate,
        slug: "shared-slug",
      },
    ], [
      {
        id: "db-template-1",
        title: "Database Template",
        description: "",
        sections: [],
        userId: "user-1",
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
        isPublic: true,
        slug: "shared-slug",
        categories: [],
        tags: [],
        version: 1,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Ultimate Camping Checklist");
    expect(isRepoTemplate(merged[0])).toBe(true);
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from "@/lib/schemas/checklistSchema";
import {
  REPO_TEMPLATE_FALLBACK_TIMESTAMP,
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  buildRepoTemplateCreatePayload,
  isRepoTemplate,
  getRepoCatalogCreatedAt,
  normalizeRepoTemplateSources,
  repoTemplates,
} from "@/lib/repoTemplateCatalog";
import bundledPack from "@/data/public-template-packs/foundational-checklists.json";

const portablePackSource = (exportedAt: string) => ({
  "../data/public-template-packs/portable.json": {
    default: {
      kind: "serplists-template-pack",
      schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
      exportedAt,
      templates: [
        {
          title: "Portable Checklist",
          slug: "portable-checklist",
          visibility: "public",
          sections: [{ title: "Prep", items: [{ title: "Review checklist" }] }],
        },
      ],
    },
  },
});

const PORTABLE_CHECKLIST_PACK_SOURCE = {
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
};

describe("repo template catalog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dates portable pack templates by the pack's exportedAt, not the load time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const first = normalizeRepoTemplateSources(portablePackSource("2026-03-22T00:00:00.000Z"));

    vi.setSystemTime(new Date("2031-06-15T12:00:00.000Z"));
    const second = normalizeRepoTemplateSources(portablePackSource("2026-03-22T00:00:00.000Z"));

    expect(first[0].createdAt).toBe("2026-03-22T00:00:00.000Z");
    expect(first[0].updatedAt).toBe("2026-03-22T00:00:00.000Z");
    expect(second.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))).toEqual(
      first.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt })),
    );
  });

  it("uses a fixed fallback date when a pack's exportedAt is not a date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const [template] = normalizeRepoTemplateSources(portablePackSource("not-a-date"));

    expect(REPO_TEMPLATE_FALLBACK_TIMESTAMP).toBe("2026-03-22T00:00:00.000Z");
    expect(template.createdAt).toBe(REPO_TEMPLATE_FALLBACK_TIMESTAMP);
    expect(template.updatedAt).toBe(REPO_TEMPLATE_FALLBACK_TIMESTAMP);
  });

  it("keeps a template's own dates and gives undated ones the pack date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const templates = normalizeRepoTemplateSources({
      "../data/public-template-packs/backup.json": {
        default: {
          version: "1.0.0",
          exportedAt: "2026-04-01T00:00:00.000Z",
          templates: [
            {
              id: "dated",
              title: "Dated",
              userId: "example-user",
              createdAt: "2026-01-05T00:00:00.000Z",
              updatedAt: "2026-02-05T00:00:00.000Z",
              slug: "dated",
              sections: [{ id: "s", title: "S", items: [{ id: "i", title: "I" }] }],
            },
            {
              title: "Undated in pack",
              slug: "undated-in-pack",
              sections: [{ id: "s", title: "S", items: [{ id: "i", title: "I" }] }],
            },
          ],
        },
      },
      "../data/public-template-packs/array.json": {
        default: [
          {
            title: "Undated",
            slug: "undated",
            sections: [{ id: "s", title: "S", items: [{ id: "i", title: "I" }] }],
          },
        ],
      },
    });

    const bySlug = new Map(templates.map((template) => [template.slug, template]));
    expect(bySlug.get("dated")).toMatchObject({
      createdAt: "2026-01-05T00:00:00.000Z",
      updatedAt: "2026-02-05T00:00:00.000Z",
    });
    expect(bySlug.get("undated-in-pack")).toMatchObject({
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    });
    expect(bySlug.get("undated")).toMatchObject({
      createdAt: REPO_TEMPLATE_FALLBACK_TIMESTAMP,
      updatedAt: REPO_TEMPLATE_FALLBACK_TIMESTAMP,
    });
  });

  it("takes the date from the pack whose copy of a slug wins", () => {
    const templates = normalizeRepoTemplateSources({
      ...portablePackSource("2026-03-22T00:00:00.000Z"),
      "../data/public-template-packs/z-later.json": {
        default: {
          ...portablePackSource("2026-05-01T00:00:00.000Z")["../data/public-template-packs/portable.json"].default,
        },
      },
    });

    expect(templates).toHaveLength(1);
    expect(templates[0].updatedAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("dates the bundled starter templates by their pack", () => {
    expect(repoTemplates.length).toBeGreaterThan(0);
    repoTemplates.forEach((template) => {
      expect(template.createdAt).toBe(bundledPack.exportedAt);
      expect(template.updatedAt).toBe(bundledPack.exportedAt);
    });
    expect(getRepoCatalogCreatedAt(repoTemplates)).toBe(bundledPack.exportedAt);
  });

  it("reports the earliest repo template date as the library's creation date", () => {
    const [template] = repoTemplates;
    expect(
      getRepoCatalogCreatedAt([
        { ...template, createdAt: "2026-05-01T00:00:00.000Z" },
        { ...template, createdAt: "2026-02-01T00:00:00.000Z" },
      ]),
    ).toBe("2026-02-01T00:00:00.000Z");
    expect(getRepoCatalogCreatedAt([])).toBe(REPO_TEMPLATE_FALLBACK_TIMESTAMP);
  });

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
    const templates = normalizeRepoTemplateSources(PORTABLE_CHECKLIST_PACK_SOURCE);

    expect(templates).toHaveLength(1);
    expect(templates[0].title).toBe("Portable Checklist");
    expect(templates[0].slug).toBe("portable-checklist");
    expect(templates[0].isPublic).toBe(true);
    expect(templates[0].userId).toBe(REPO_TEMPLATE_USER_ID);
  });

  it("builds a private copy payload from a repo template without its slug, which the server derives from the title and suffixes", () => {
    const [template] = normalizeRepoTemplateSources(PORTABLE_CHECKLIST_PACK_SOURCE);

    const payload = buildRepoTemplateCreatePayload(template, undefined);

    expect(payload).toMatchObject({
      title: "Portable Checklist",
      type: "checklist",
      isPublic: false,
      categories: ["ops"],
      tags: ["portable"],
    });
    expect(payload.sections).toEqual(template.sections);
    expect(payload.seoUrl).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateStableTemplateIdentities } from "@functions/api/utils/template-reconciliation";
import { applyTemplateSaveDefaults as applyDefaults } from "@/hooks/useTemplateValidation";
import {
  createTemplateEditorContent,
  createTemplateEditorItem,
  createTemplateEditorSection,
} from "@/lib/forms/templateEditorForm";
import { portableChecklistSectionSchema } from "@/lib/schemas/checklistSchema";
import type { ChecklistItemContent, ChecklistSection } from "@/types/checklist";

const emptySection = (id: string, title = "Phase 2"): ChecklistSection => ({
  id,
  title,
  items: [],
});

describe("applyTemplateSaveDefaults", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Runs match tasks by id: a new placeholder id on every save would retire the
  // runner's placeholder (with its completion) and add a fresh one each time.
  it("gives an empty section the same placeholder task id on every save", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
    const first = applyDefaults("Moving", [emptySection("section-2")]);
    vi.setSystemTime(new Date("2026-09-28T10:05:00.000Z"));
    const second = applyDefaults("Moving", [emptySection("section-2")]);

    expect(first.sections[0].items).toHaveLength(1);
    expect(first.sections[0].items[0].title).toBe("New task");
    expect(second.sections[0].items[0].id).toBe(first.sections[0].items[0].id);
  });

  it("gives each empty section its own placeholder id, unused by any other task", () => {
    const sections: ChecklistSection[] = [
      emptySection("section-a"),
      emptySection("section-b"),
      {
        id: "section-c",
        title: "Taken",
        // A real task that already has the id a placeholder would get.
        items: [{ id: "section-a-first-task", title: "Real task" }],
      },
    ];

    const result = applyDefaults("Moving", sections);
    const ids = result.sections.flatMap((section) => section.items.map((item) => item.id));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("section-a-first-task");
    expect(result.sections[2].items[0].title).toBe("Real task");
    expect(validateStableTemplateIdentities(result.sections)).toBeNull();
  });

  it("changes nothing when applied to its own result", () => {
    const once = applyDefaults("", [
      emptySection("section-1"),
      { id: "section-2", title: "Prep", items: [{ id: "item-1", title: "  " }] },
    ]);

    expect(applyDefaults(once.title, once.sections)).toEqual(once);
    expect(once.title).toBe("Untitled Template");
    expect(once.sections[1].items[0].title).toBe("Task 1");
  });

  it("uses fixed ids for the starter section of a template with none", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
    const first = applyDefaults("Moving", []);
    vi.setSystemTime(new Date("2026-09-28T11:00:00.000Z"));
    const second = applyDefaults("Moving", []);

    expect(second).toEqual(first);
    expect(first.sections[0].items).toHaveLength(1);
  });

  // The outline shows an untitled section as "Section N"; runs and public pages show the
  // stored title, so the saved title must be the label the author saw.
  it("titles a blank or whitespace-only section by its position, keeping its id", () => {
    const result = applyDefaults("Moving", [
      { id: "section-a", title: "", items: [{ id: "item-1", title: "Pack" }] },
      { id: "section-b", title: "   ", items: [{ id: "item-2", title: "Load" }] },
      { id: "section-c", title: "  Unpack  ", items: [{ id: "item-3", title: "Sort" }] },
    ]);

    expect(result.sections.map((section) => section.title)).toEqual([
      "Section 1",
      "Section 2",
      "Unpack",
    ]);
    expect(result.sections.map((section) => section.id)).toEqual([
      "section-a",
      "section-b",
      "section-c",
    ]);
  });

  it("titles a blank empty section too", () => {
    const result = applyDefaults("Moving", [emptySection("section-1", "")]);

    expect(result.sections[0].title).toBe("Section 1");
    expect(result.sections[0].items[0].title).toBe("New task");
  });

  // Runs draw each sub-task as a checkbox that counts toward progress, so a blank one
  // (Enter or "Add Sub-task" appends one) would be an unlabeled box the task waits on.
  it("drops blank sub-tasks and keeps the others with their ids", () => {
    const subItemsBlock: ChecklistItemContent = {
      id: "content-1",
      type: "subItems",
      value: "",
      subItems: [
        { id: "sub-1", title: "Check title" },
        { id: "sub-2", title: "" },
        { id: "sub-3", title: "   " },
        { id: "sub-4", title: " Check links ", isCompleted: false },
      ],
    };

    const result = applyDefaults("Moving", [
      { id: "section-1", title: "Prep", items: [{ id: "item-1", title: "Audit", contents: [subItemsBlock] }] },
    ]);

    expect(result.sections[0].items[0].contents).toEqual([
      {
        id: "content-1",
        type: "subItems",
        value: "",
        subItems: [
          { id: "sub-1", title: "Check title" },
          { id: "sub-4", title: "Check links", isCompleted: false },
        ],
      },
    ]);
  });

  it("removes a Sub-tasks block left with no sub-tasks and keeps the other blocks", () => {
    const result = applyDefaults("Moving", [
      {
        id: "section-1",
        title: "Prep",
        items: [
          {
            id: "item-1",
            title: "Audit",
            contents: [
              { id: "content-1", type: "subItems", value: "", subItems: [{ id: "sub-1", title: " " }] },
              { id: "content-2", type: "text", value: "Read the brief" },
              { id: "content-3", type: "subItems", value: "" },
              { id: "content-4", type: "subItems", value: "", subItems: [] },
            ],
          },
          { id: "item-2", title: "No blocks" },
        ],
      },
    ]);

    expect(result.sections[0].items[0].contents).toEqual([
      { id: "content-2", type: "text", value: "Read the brief" },
    ]);
    // A task without contents is left as it was.
    expect(result.sections[0].items[1]).not.toHaveProperty("contents");
  });

  it("does not change the sections it was given", () => {
    const sections: ChecklistSection[] = [
      {
        id: "section-1",
        title: "",
        items: [{
          id: "item-1",
          title: "",
          contents: [{ id: "content-1", type: "subItems", value: "", subItems: [{ id: "sub-1", title: "" }] }],
        }],
      },
    ];
    const before = structuredClone(sections);

    const result = applyDefaults("", sections);

    expect(sections).toEqual(before);
    expect(applyDefaults(result.title, result.sections)).toEqual(result);
  });

  // New sections and Sub-tasks blocks start blank. Whatever the editor produces, the
  // saved sections must have titled sections and sub-tasks, like the portable format.
  it("saves sections built from the editor's blank defaults in the portable shape", () => {
    const item = {
      ...createTemplateEditorItem(),
      contents: [
        createTemplateEditorContent("subItems"),
        createTemplateEditorContent("text"),
        {
          ...createTemplateEditorContent("subItems"),
          subItems: [
            { id: "sub-a", title: "Check title" },
            { id: "sub-b", title: "" },
          ],
        },
      ],
    };
    const sections: ChecklistSection[] = [
      { ...createTemplateEditorSection(), items: [item] },
      createTemplateEditorSection(),
    ];

    const result = applyDefaults("", sections);

    for (const section of result.sections) {
      expect(portableChecklistSectionSchema.safeParse(section).error).toBeUndefined();
    }
    const blocks = result.sections[0].items[0].contents ?? [];
    expect(blocks.map((content) => content.type)).toEqual(["text", "subItems"]);
    expect(blocks[1].subItems).toEqual([{ id: "sub-a", title: "Check title" }]);
  });
});

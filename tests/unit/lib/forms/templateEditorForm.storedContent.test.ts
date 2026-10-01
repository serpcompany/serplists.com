import { describe, expect, it } from "vitest";
import { firstOf, sectionAt, taskAt } from "../../../support/elements";

import { mapApiTemplateToChecklistTemplate } from "@/features/template-detail/templateDetailMappers";
import {
  buildTemplateEditorFormValues,
  templateEditorFormSchema,
  validateTemplateEditorFormForSave,
} from "@/lib/forms/templateEditorForm";
import type { ChecklistSection } from "@/types/checklist";

const contentsStoredBeforeTheApiCheckedWrites: Array<[string, unknown]> = [
  ["null file details", { id: "c1", type: "file", value: "https://x/doc.pdf", fileName: null, fileSize: null, uploadType: null }],
  ["a numeric id and value", { id: 1, type: "text", value: 5 }],
  ["an unknown type", { id: "c2", type: "link", value: "https://example.com" }],
  ["a null type", { id: "c3", type: null, value: "hi" }],
  ["sub-items on a text block", { id: "c4", type: "text", value: "x", subItems: [{ id: "s", title: "t" }] }],
  ["sub-items that are not a list", { id: "c5", type: "subItems", value: "", subItems: "nope" }],
  ["a sub-item with a numeric id and no title", { id: "c6", type: "subItems", value: "", subItems: [{ id: 2, title: null, isCompleted: "yes" }] }],
  ["an invalid upload type and negative size", { id: "c7", type: "video", value: "", uploadType: "ftp", fileSize: -4 }],
  ["a bare string", "Just some text"],
];

const sectionsWith = (content: unknown): ChecklistSection[] =>
  [
    {
      id: "section-1",
      title: "Prep",
      items: [{ id: "item-1", title: "Task", description: 12, contents: [content] }],
    },
  ] as unknown as ChecklistSection[];

describe("buildTemplateEditorFormValues with content stored before the API checked every write", () => {
  it.each(contentsStoredBeforeTheApiCheckedWrites)("opens %s in a state the editor can save", (_label, content) => {
    const direct = buildTemplateEditorFormValues({ title: "Legacy", sections: sectionsWith(content) });
    const loaded = buildTemplateEditorFormValues(
      mapApiTemplateToChecklistTemplate(
        { id: "t1", title: "Legacy", items: JSON.stringify(sectionsWith(content)) },
        "legacy",
      ),
    );

    for (const values of [direct, loaded]) {
      const parsed = templateEditorFormSchema.safeParse(values);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("keeps what the stored content says", () => {
    const [unknownType, numeric, file, bare] = taskAt(buildTemplateEditorFormValues({
      sections: [
        {
          id: "section-1",
          title: "Prep",
          items: [
            {
              id: "item-1",
              title: "Task",
              description: 12,
              contents: [
                { id: "c2", type: "link", value: "https://example.com" },
                { id: 1, type: "text", value: 5 },
                { id: "c1", type: "file", value: "/api/uploads/file?key=template-files%2Fu1%2Fdoc.pdf", fileName: "doc.pdf", fileSize: 2048, uploadType: "upload" },
                "Just some text",
              ],
            },
          ],
        },
      ] as unknown as ChecklistSection[],
    }), 0, 0).contents ?? [];

    expect(unknownType).toEqual(expect.objectContaining({ type: "text", value: "https://example.com" }));
    expect(numeric).toEqual(expect.objectContaining({ id: "1", type: "text", value: "5" }));
    expect(file).toEqual(
      expect.objectContaining({ fileName: "doc.pdf", fileSize: 2048, uploadType: "upload" }),
    );
    expect(bare).toEqual(expect.objectContaining({ type: "text", value: "Just some text" }));
  });

  it("drops a file name and size left over from an upload the value no longer points to, so the next save stores the fix, and keeps a name an author gave a linked file", () => {
    const contents = taskAt(buildTemplateEditorFormValues({
      sections: [
        {
          id: "section-1",
          title: "Prep",
          items: [
            {
              id: "item-1",
              title: "Task",
              contents: [
                { id: "c1", type: "file", value: "https://example.com/pricing.pdf", fileName: "report.pdf", fileSize: 2048, uploadType: "upload" },
                { id: "c2", type: "image", value: "https://example.com/a.png", fileName: "a.png", fileSize: 10 },
                { id: "c3", type: "file", value: "https://example.com/launch.pdf", fileName: "launch.pdf", uploadType: "url" },
                { id: "c4", type: "file", value: "/api/uploads/file?key=k", fileName: "doc.pdf", fileSize: 5 },
              ],
            },
          ],
        },
      ] as unknown as ChecklistSection[],
    }), 0, 0).contents ?? [];

    expect(contents[0]).toEqual(
      expect.objectContaining({ value: "https://example.com/pricing.pdf", fileName: undefined, fileSize: undefined, uploadType: "url" }),
    );
    expect(contents[1]).toEqual(expect.objectContaining({ fileName: undefined, fileSize: undefined }));
    expect(contents[2]).toEqual(expect.objectContaining({ fileName: "launch.pdf", uploadType: "url" }));
    expect(contents[3]).toEqual(expect.objectContaining({ fileName: "doc.pdf", fileSize: 5 }));
  });

  it("gives every content block its own id, since an upload finds its block by id", () => {
    const values = buildTemplateEditorFormValues({
      sections: [
        {
          id: "section-1",
          title: "Prep",
          items: [
            { id: "item-1", title: "A", contents: [{ id: 1, type: "text", value: "a" }, { id: "1", type: "text", value: "b" }] },
            { id: "item-2", title: "B", contents: [{ id: 1, type: "image", value: "" }] },
          ],
        },
      ] as unknown as ChecklistSection[],
    });

    const ids = values.sections.flatMap((section) =>
      section.items.flatMap((item) => (item.contents ?? []).map((content) => content.id)),
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("1");
  });
});

describe("validateTemplateEditorFormForSave", () => {
  it("names the section, task, and block of an invalid content block", () => {
    const values = buildTemplateEditorFormValues({ title: "T" });
    sectionAt(values, 0).items.push({
      id: "item-1",
      title: "Task",
      contents: [{ id: 1 as unknown as string, type: "text", value: "x" }],
    });

    const errors = validateTemplateEditorFormForSave(values);

    expect(errors).toHaveLength(1);
    expect(firstOf(errors).message).toMatch(/^Section 1, task 1, content block 1: /);
  });
});

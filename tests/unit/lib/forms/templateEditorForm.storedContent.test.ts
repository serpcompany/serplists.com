import { describe, expect, it } from "vitest";
import { taskAt } from "../../../support/elements";

import { mapApiTemplateToChecklistTemplate } from "@/features/template-detail/templateDetailMappers";
import {
  buildTemplateEditorFormValues,
  templateEditorFormSchema,
} from "@/lib/forms/templateEditorForm";
import { apiTemplateSchema } from "@/lib/schemas/apiTemplates";

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

const sectionsWith = (...contents: unknown[]): unknown => [
  {
    id: "section-1",
    title: "Prep",
    items: [{ id: "item-1", title: "Task", description: 12, contents }],
  },
];

const formValuesOfTheStored = (sections: unknown) => buildTemplateEditorFormValues({ title: "Legacy", sections });

const formValuesOfTheLoaded = (sections: unknown) =>
  buildTemplateEditorFormValues(
    mapApiTemplateToChecklistTemplate(
      apiTemplateSchema.parse({ id: "t1", title: "Legacy", items: JSON.stringify(sections) }),
      "legacy",
    ),
  );

describe("buildTemplateEditorFormValues with content stored before the API checked every write", () => {
  it.each(contentsStoredBeforeTheApiCheckedWrites)("opens %s in a state the editor can save", (_label, content) => {
    for (const values of [formValuesOfTheStored(sectionsWith(content)), formValuesOfTheLoaded(sectionsWith(content))]) {
      const parsed = templateEditorFormSchema.safeParse(values);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("keeps what the stored content says", () => {
    const [unknownType, numeric, file, bare] = taskAt(formValuesOfTheStored(sectionsWith(
      { id: "c2", type: "link", value: "https://example.com" },
      { id: 1, type: "text", value: 5 },
      { id: "c1", type: "file", value: "/api/uploads/file?key=template-files%2Fu1%2Fdoc.pdf", fileName: "doc.pdf", fileSize: 2048, uploadType: "upload" },
      "Just some text",
    )), 0, 0).contents ?? [];

    expect(unknownType).toEqual(expect.objectContaining({ type: "text", value: "https://example.com" }));
    expect(numeric).toEqual(expect.objectContaining({ id: "1", type: "text", value: "5" }));
    expect(file).toEqual(
      expect.objectContaining({ fileName: "doc.pdf", fileSize: 2048, uploadType: "upload" }),
    );
    expect(bare).toEqual(expect.objectContaining({ type: "text", value: "Just some text" }));
  });

  it("drops a file name and size left over from an upload the value no longer points to, so the next save stores the fix, and keeps a name an author gave a linked file", () => {
    const contents = taskAt(formValuesOfTheStored(sectionsWith(
      { id: "c1", type: "file", value: "https://example.com/pricing.pdf", fileName: "report.pdf", fileSize: 2048, uploadType: "upload" },
      { id: "c2", type: "image", value: "https://example.com/a.png", fileName: "a.png", fileSize: 10 },
      { id: "c3", type: "file", value: "https://example.com/launch.pdf", fileName: "launch.pdf", uploadType: "url" },
      { id: "c4", type: "file", value: "/api/uploads/file?key=k", fileName: "doc.pdf", fileSize: 5 },
    )), 0, 0).contents ?? [];

    expect(contents[0]).toEqual(
      expect.objectContaining({ value: "https://example.com/pricing.pdf", fileName: undefined, fileSize: undefined, uploadType: "url" }),
    );
    expect(contents[1]).toEqual(expect.objectContaining({ fileName: undefined, fileSize: undefined }));
    expect(contents[2]).toEqual(expect.objectContaining({ fileName: "launch.pdf", uploadType: "url" }));
    expect(contents[3]).toEqual(expect.objectContaining({ fileName: "doc.pdf", fileSize: 5 }));
  });

  it("gives every content block its own id, since an upload finds its block by id", () => {
    const values = formValuesOfTheStored([
      {
        id: "section-1",
        title: "Prep",
        items: [
          { id: "item-1", title: "A", contents: [{ id: 1, type: "text", value: "a" }, { id: "1", type: "text", value: "b" }] },
          { id: "item-2", title: "B", contents: [{ id: 1, type: "image", value: "" }] },
        ],
      },
    ]);

    const ids = values.sections.flatMap((section) =>
      section.items.flatMap((item) => (item.contents ?? []).map((content) => content.id)),
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("1");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildTemplateEditorFormValues,
  createTemplateEditorContent,
  createTemplateEditorFormField,
  createTemplateEditorFormOption,
  templateEditorFormSchema,
} from "@/lib/forms/templateEditorForm";
import { stringMatching } from "../../../support/asymmetricMatchers";
import { contentAt, firstOf, taskAt } from "../../../support/elements";

const storedTemplate = (contents: unknown[]) => ({
  sections: [{ id: "s1", title: "Kickoff", items: [{ id: "i1", title: "Brief", contents }] }],
});

const editorContents = (contents: unknown[]) => {
  const values = buildTemplateEditorFormValues(storedTemplate(contents));
  return taskAt(values, 0, 0).contents ?? [];
};

describe("template editor form blocks", () => {
  it("starts a new form block with one short text field", () => {
    const content = createTemplateEditorContent("form");

    expect(content).toMatchObject({ type: "form", value: "" });
    expect(content.id).toMatch(/^content_/);
    const field = firstOf(content.fields ?? []);
    expect(field).toEqual({ id: stringMatching(/^field_/), kind: "text", label: "", required: false });
  });

  it("starts a choice field with one blank option and other kinds with none", () => {
    expect(createTemplateEditorFormField("select").options).toEqual([{ id: stringMatching(/^option_/), label: "" }]);
    expect(createTemplateEditorFormField("number").options).toBeUndefined();
    expect(createTemplateEditorFormOption()).toEqual({ id: stringMatching(/^option_/), label: "" });
  });

  it("keeps a stored form block, its field ids and definitions, and leaves out answers", () => {
    const [form] = editorContents([{
      id: "c1",
      type: "form",
      value: "",
      fields: [
        { id: "field_a", label: "Plan", kind: "select", required: true, options: [{ id: "o1", label: "Pro" }], answer: "o1" },
        { id: "field_b", label: "Seats", kind: "number", required: false, min: 1, max: 9, description: "How many", answer: 3 },
      ],
    }]);

    expect(form).toMatchObject({ id: "c1", type: "form" });
    expect(form?.fields).toEqual([
      { id: "field_a", label: "Plan", kind: "select", required: true, options: [{ id: "o1", label: "Pro" }] },
      { id: "field_b", label: "Seats", kind: "number", required: false, min: 1, max: 9, description: "How many" },
    ]);
    expect(JSON.stringify(form)).not.toContain("answer");
  });

  it("gives a repeated field id a new one, keeps kind-specific keys only on their kinds, and drops fields from other blocks", () => {
    const contents = editorContents([
      { id: "c1", type: "form", value: "", fields: [
        { id: "dup", label: "A", kind: "text", options: [{ id: "o", label: "O" }], min: 1 },
        { id: "dup", label: "B", kind: "weird" },
      ] },
      { id: "c2", type: "text", value: "Body", fields: [{ id: "stray", label: "S", kind: "text" }] },
    ]);
    const fields = contentAt({ contents }, 0).fields ?? [];

    expect(fields.map((field) => field.kind)).toEqual(["text", "text"]);
    expect(firstOf(fields)).toMatchObject({ id: "dup", options: undefined, min: undefined });
    expect(fields[1]?.id).toMatch(/^field_/);
    expect(contentAt({ contents }, 1).fields).toBeUndefined();
  });

  it("validates as part of the editor form", () => {
    const values = buildTemplateEditorFormValues(storedTemplate([createTemplateEditorContent("form")]));

    expect(templateEditorFormSchema.safeParse(values).success).toBe(true);
  });
});

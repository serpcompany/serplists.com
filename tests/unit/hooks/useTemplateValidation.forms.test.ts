import { describe, expect, it } from "vitest";

import { applyTemplateSaveDefaults as applyDefaults } from "@/hooks/useTemplateValidation";
import type { ChecklistFormField, ChecklistItemContent, ChecklistSection } from "@/types/checklist";

import { taskAt } from "../../support/elements";

const sectionWith = (contents: ChecklistItemContent[]): ChecklistSection[] => [
  { id: "section-1", title: "Intake", items: [{ id: "task-1", title: "Collect details", contents }] },
];

const formOf = (fields: ChecklistFormField[]): ChecklistItemContent => ({ id: "form-1", type: "form", value: "", fields });

const savedContents = (contents: ChecklistItemContent[]) =>
  taskAt(applyDefaults("Intake", sectionWith(contents)), 0, 0).contents;

describe("applyTemplateSaveDefaults on a Form block", () => {
  it("drops fields without a label and trims the rest, keeping each field's id", () => {
    expect(savedContents([formOf([
      { id: "field_a", label: "  Client name ", kind: "text", required: true, description: "  As on the contract " },
      { id: "field_b", label: "   ", kind: "email", required: true },
      { id: "field_c", label: "Website", kind: "url", required: false, description: "  " },
    ])])).toEqual([formOf([
      { id: "field_a", label: "Client name", kind: "text", required: true, description: "As on the contract" },
      { id: "field_c", label: "Website", kind: "url", required: false },
    ])]);
  });

  it("drops blank options, and a dropdown or multiple choice field left with none, since no one could answer it", () => {
    expect(savedContents([formOf([
      { id: "field_a", label: "Plan", kind: "select", required: true, options: [{ id: "option_1", label: " Free " }, { id: "option_2", label: "" }] },
      { id: "field_b", label: "Channels", kind: "multiSelect", required: false, options: [{ id: "option_3", label: "  " }] },
    ])])).toEqual([formOf([
      { id: "field_a", label: "Plan", kind: "select", required: true, options: [{ id: "option_1", label: "Free" }] },
    ])]);
  });

  it("drops a Form block left with no fields, and keeps the blocks around it", () => {
    const text: ChecklistItemContent = { id: "text-1", type: "text", value: "Read the brief" };

    expect(savedContents([formOf([{ id: "field_a", label: "", kind: "text", required: false }]), text])).toEqual([text]);
  });

  it("keeps a minimum and maximum only on a number, and options only on a choice", () => {
    expect(savedContents([formOf([
      { id: "field_a", label: "Seats", kind: "number", required: false, min: 1, max: 10 },
      { id: "field_b", label: "Due", kind: "date", required: false, min: 1, max: 2, options: [{ id: "option_1", label: "Stale" }] },
    ])])).toEqual([formOf([
      { id: "field_a", label: "Seats", kind: "number", required: false, min: 1, max: 10 },
      { id: "field_b", label: "Due", kind: "date", required: false },
    ])]);
  });

  it("changes nothing when applied to its own result, so saving again sends the same form", () => {
    const once = applyDefaults("Intake", sectionWith([formOf([
      { id: "field_a", label: " Plan ", kind: "select", required: true, options: [{ id: "option_1", label: "Free" }, { id: "option_2", label: "" }] },
      { id: "field_b", label: "", kind: "text", required: false },
    ])]));

    expect(applyDefaults(once.title, once.sections)).toEqual(once);
  });
});

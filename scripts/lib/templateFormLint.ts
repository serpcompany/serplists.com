import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { formFieldOptionLabels, type PortableFormField } from "./templateAssetLabels";

type FormLintIssue = { code: string; message: string };

const isChoice = (field: PortableFormField) => field.kind === "select" || field.kind === "multiSelect";

function formFieldIssues(field: PortableFormField, where: string): FormLintIssue[] {
  const issues: FormLintIssue[] = [];
  if (!field.label.trim()) {
    issues.push({ code: "blank-form-field-label", message: `${where} needs a label` });
  }
  if (isChoice(field) && formFieldOptionLabels(field).every((label) => !label.trim())) {
    issues.push({ code: "form-field-without-options", message: `${where} (${field.kind}) needs at least one option` });
  }
  return issues;
}

export function findTemplateFormIssues(template: PortableChecklistTemplate): FormLintIssue[] {
  return template.sections.flatMap((section, sectionIndex) =>
    section.items.flatMap((item, itemIndex) =>
      (item.contents ?? []).flatMap((content, contentIndex) => {
        if (content.type !== "form") return [];
        const where = `Item ${sectionIndex + 1}.${itemIndex + 1} content block ${contentIndex + 1}`;
        if (content.fields.length === 0) {
          return [{ code: "empty-form", message: `${where} (form) must include at least one field` }];
        }
        return content.fields.flatMap((field, fieldIndex) => formFieldIssues(field, `${where} form field ${fieldIndex + 1}`));
      })));
}

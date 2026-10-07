import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { FORM_FIELD_KIND_LABELS } from "../../src/lib/schemas/formFields";

type PortableContent = NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number];
export type PortableFormField = Extract<PortableContent, { type: "form" }>["fields"][number];

const numberRange = (field: PortableFormField): string | null => {
  if (field.kind !== "number") return null;
  if (field.min !== undefined && field.max !== undefined) return `${field.min} to ${field.max}`;
  if (field.min !== undefined) return `at least ${field.min}`;
  return field.max === undefined ? null : `at most ${field.max}`;
};

export const describeFormField = (field: PortableFormField): string =>
  [FORM_FIELD_KIND_LABELS[field.kind], field.required ? "required" : "optional", numberRange(field)]
    .filter((part) => part !== null)
    .join(", ");

export const formFieldOptionLabels = (field: PortableFormField): string[] =>
  field.kind === "select" || field.kind === "multiSelect" ? field.options.map((option) => option.label) : [];

export const formatBytes = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
};

export const inferEmbedProvider = (url: string) => {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YouTube";
  if (value.includes("vimeo.com")) return "Vimeo";
  if (value.includes("loom.com")) return "Loom";
  if (value.includes("figma.com")) return "Figma";
  if (value.includes("maps.google")) return "Google Maps";
  return "Embedded Content";
};

import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { FORM_FIELD_KIND_LABELS } from "../../src/lib/schemas/formFields";
import { getEmbedLinkUrl } from "../../src/lib/utils/embedLink";

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

const isDomainOrSubdomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const GOOGLE_MAPS_HOSTNAME = /^maps\.google\.(?:com|(?:co\.|com\.)?[a-z]{2})$/;

const EMBED_PROVIDERS = [
  { name: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { name: "Vimeo", domains: ["vimeo.com"] },
  { name: "Loom", domains: ["loom.com"] },
  { name: "Figma", domains: ["figma.com"] },
];

const providerOfHostname = (hostname: string) => {
  if (GOOGLE_MAPS_HOSTNAME.test(hostname)) return "Google Maps";
  const provider = EMBED_PROVIDERS.find(({ domains }) => domains.some((domain) => isDomainOrSubdomain(hostname, domain)));
  return provider?.name ?? "Embedded Content";
};

export const inferEmbedProvider = (embed: string) => {
  const link = getEmbedLinkUrl(embed);
  return link ? providerOfHostname(new URL(link).hostname) : "Embedded Content";
};

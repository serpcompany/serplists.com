import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { normalizePortableTemplate } from "../../src/lib/templates/portableTemplateNormalization";
import {
  describeFormField,
  formatBytes,
  formFieldOptionLabels,
  inferEmbedProvider,
  type PortableFormField,
} from "./templateAssetLabels";
import { getEmbedLinkUrl } from "../../src/lib/utils/embedLink";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderFormField = (field: PortableFormField) => {
  const options = formFieldOptionLabels(field);
  const optionsMarkup = options.length
    ? `<ul class="form-options">${options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>`
    : "";
  const help = field.description ? `<p>${escapeHtml(field.description)}</p>` : "";
  return `<li><div class="form-label">${escapeHtml(field.label)} <span class="card-meta">${escapeHtml(describeFormField(field))}</span></div>${help}${optionsMarkup}</li>`;
};

const renderPreviewCard = (content: NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number]): string => {
  if (content.type === "text") {
    return `<div class="content-block text-block"><div class="card-label">Text</div><div class="text-markdown"><pre>${escapeHtml(content.value.trim())}</pre></div></div>`;
  }

  if (content.type === "subItems") {
    const items = (content.subItems ?? [])
      .map((subItem) => `<li><span class="checkbox" aria-hidden="true"></span><span>${escapeHtml(subItem.title)}</span></li>`)
      .join("");
    return `<div class="content-block card"><div class="card-label">Checklist</div><ul class="subitem-list">${items}</ul></div>`;
  }

  if (content.type === "form") {
    return `<div class="content-block card form-card"><div class="card-label">Form</div><ul class="form-fields">${content.fields.map(renderFormField).join("")}</ul></div>`;
  }

  if (content.type === "image") {
    return `<div class="content-block card media-card"><div class="card-label">Image</div><img src="${escapeHtml(content.value)}" alt="${escapeHtml(content.fileName || "Template image")}" /><div class="card-meta"><a href="${escapeHtml(content.value)}">${escapeHtml(content.fileName || content.value)}</a></div></div>`;
  }

  if (content.type === "video") {
    return `<div class="content-block card media-card"><div class="card-label">Video</div><div class="media-placeholder">Video Preview</div><div class="card-meta"><a href="${escapeHtml(content.value)}">${escapeHtml(content.fileName || content.value)}</a></div></div>`;
  }

  if (content.type === "file") {
    return `<div class="content-block card file-card"><div class="card-label">File</div><div class="file-name">${escapeHtml(content.fileName || content.value)}</div><div class="card-meta"><a href="${escapeHtml(content.value)}">Open file</a>${content.fileSize ? ` <span>· ${escapeHtml(formatBytes(content.fileSize) || "")}</span>` : ""}</div></div>`;
  }

  if (content.type === "embed") {
    const embedLink = getEmbedLinkUrl(content.value);
    const embedBody = embedLink
      ? `<a href="${escapeHtml(embedLink)}">${escapeHtml(embedLink)}</a>`
      : `<pre style="white-space: pre-wrap; overflow-wrap: anywhere;">${escapeHtml(content.value)}</pre>`;
    return `<div class="content-block card embed-card"><div class="card-label">${escapeHtml(inferEmbedProvider(content.value))}</div><div class="embed-url">${embedBody}</div></div>`;
  }

  const unhandled: never = content;
  return unhandled;
};

export const renderTemplatePreviewHtml = (template: PortableChecklistTemplate) => {
  const normalized = normalizePortableTemplate(template);
  const sectionMarkup = normalized.sections
    .map((section) => {
      const itemsMarkup = section.items
        .map((item) => {
          const contentsMarkup = (item.contents ?? []).map((content) => renderPreviewCard(content)).join("");
          return `<article class="item-card"><div class="item-header"><span class="item-checkbox" aria-hidden="true"></span><div><h3>${escapeHtml(item.title)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div></div>${contentsMarkup ? `<div class="item-content">${contentsMarkup}</div>` : ""}</article>`;
        })
        .join("");
      return `<section class="section-card"><h2>${escapeHtml(section.title)}</h2>${itemsMarkup}</section>`;
    })
    .join("");

  const requiredToolsMarkup = normalized.requiredTools?.length
    ? `<section class="section-card"><h2>Required tools</h2><ul class="card-meta">${normalized.requiredTools
        .map((tool) => `<li><a href="${escapeHtml(tool.url)}">${escapeHtml(tool.name)}</a> <span>${tool.required ? "Required" : "Optional"}</span></li>`)
        .join("")}</ul></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(normalized.seoTitle || normalized.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --surface: #fffdf8;
        --surface-strong: #f0ebe0;
        --ink: #1f1d1a;
        --muted: #6c655d;
        --line: #ddd2be;
        --accent: #b96b2f;
        --accent-soft: #f7e4d4;
        --shadow: 0 14px 30px rgba(71, 55, 34, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: linear-gradient(180deg, #f8f5ee 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 20px 72px;
      }
      .hero, .section-card, .item-card, .card {
        background: var(--surface);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }
      .hero {
        border-radius: 28px;
        padding: 32px;
        margin-bottom: 24px;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font: 600 12px/1.2 Arial, sans-serif;
        color: var(--accent);
      }
      h1, h2, h3 { margin: 0; }
      h1 { font-size: clamp(2.2rem, 4vw, 3.6rem); margin-top: 10px; }
      .hero p, .item-header p, .meta-row { color: var(--muted); }
      .meta-row { margin-top: 14px; font: 500 14px/1.5 Arial, sans-serif; }
      .sections { display: grid; gap: 22px; }
      .section-card {
        border-radius: 24px;
        padding: 24px;
      }
      .section-card h2 {
        font-size: 1.55rem;
        margin-bottom: 18px;
      }
      .section-card h2::before {
        content: "";
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-right: 10px;
        border-radius: 999px;
        background: var(--accent);
      }
      .item-card {
        border-radius: 20px;
        padding: 20px;
        margin-top: 16px;
      }
      .item-header {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 14px;
        align-items: start;
      }
      .item-checkbox, .checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid var(--accent);
        border-radius: 6px;
        display: inline-block;
        flex: 0 0 auto;
      }
      .item-content {
        display: grid;
        gap: 14px;
        margin-top: 16px;
      }
      .content-block.card {
        border-radius: 18px;
        padding: 16px;
      }
      .card-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font: 600 12px/1 Arial, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        background: var(--accent-soft);
        border-radius: 999px;
        padding: 7px 10px;
        margin-bottom: 12px;
      }
      .media-card img {
        width: 100%;
        max-height: 260px;
        object-fit: cover;
        border-radius: 14px;
        display: block;
        border: 1px solid var(--line);
      }
      .media-placeholder {
        border-radius: 14px;
        min-height: 160px;
        display: grid;
        place-items: center;
        background: var(--surface-strong);
        color: var(--muted);
        font: 600 14px/1 Arial, sans-serif;
        border: 1px dashed var(--line);
      }
      .card-meta, .embed-url, .file-name {
        font: 500 14px/1.5 Arial, sans-serif;
      }
      .card-meta, .embed-url { margin-top: 12px; color: var(--muted); }
      .form-fields, .form-options {
        margin: 0;
        display: grid;
        gap: 10px;
        font: 500 14px/1.5 Arial, sans-serif;
      }
      .form-fields { list-style: none; padding: 0; }
      .form-fields p { margin: 4px 0 0; color: var(--muted); }
      .form-label { font-weight: 600; }
      .subitem-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .subitem-list li {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 10px;
        align-items: start;
      }
      .text-block pre {
        margin: 0;
        white-space: pre-wrap;
        font: 500 14px/1.6 "SFMono-Regular", Consolas, monospace;
        color: #2f2922;
        background: var(--surface-strong);
        border-radius: 14px;
        border: 1px solid var(--line);
        padding: 14px;
      }
      a { color: var(--accent); }
      @media (max-width: 720px) {
        main { padding: 20px 14px 40px; }
        .hero, .section-card, .item-card { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <div class="eyebrow">${escapeHtml(normalized.type || "checklist")}</div>
        <h1>${escapeHtml(normalized.title)}</h1>
        ${normalized.description ? `<p>${escapeHtml(normalized.description)}</p>` : ""}
        ${(normalized.categories?.length || normalized.tags?.length)
          ? `<div class="meta-row">${[
              normalized.categories?.length ? `Categories: ${escapeHtml(normalized.categories.join(", "))}` : "",
              normalized.tags?.length ? `Tags: ${escapeHtml(normalized.tags.join(", "))}` : "",
            ].filter(Boolean).join(" · ")}</div>`
          : ""}
      </header>
      <div class="sections">
        ${requiredToolsMarkup}${sectionMarkup}
      </div>
    </main>
  </body>
</html>
`;
};

import { describe, expect, it } from "vitest";

import { buildRunUpdatePayload } from "@/contexts/runUpdatePayload";
import { mapApiTemplate } from "@/contexts/templateListFetchers";
import { mapChecklistToRun } from "@/features/run-execution/runExecutionMappers";
import { applyTemplateSaveDefaults } from "@/hooks/useTemplateValidation";
import { buildTemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_MAX_BYTES,
} from "@/lib/schemas/contentLimits";
import { sanitizeStoredSections } from "@/lib/schemas/storedSections";
import {
  RUN_TITLE_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_LIST_ITEM_MAX,
  TEMPLATE_LIST_MAX_ITEMS,
  TEMPLATE_SEO_DESCRIPTION_MAX,
  TEMPLATE_SEO_TITLE_MAX,
  TEMPLATE_SLUG_MAX,
  TEMPLATE_TITLE_MAX,
} from "@/lib/schemas/templateLimits";
import { buildTemplateUpdateRequest } from "@/lib/templates/templateUpdate";
import type { ChecklistSection } from "@/types/checklist";
import { buildTemplateVersionValues } from "@functions/api/utils/audit";
import { requestBodyLimit } from "@functions/api/utils/body-limit";
import { normalizeSectionsPayload } from "@functions/api/utils/payloads";
import { resetRunCompletionState } from "@functions/api/utils/template-reconciliation";

// Every stored Template and run must fit back through its own save route: the editor's PUT
// /api/templates/:id and a run's PUT /api/checklists/:id (or share-link PUT) resend the whole
// content under the router's body limit. These tests run the app's own load and save code over
// content built to make it grow as much as possible, so raising a content limit, lowering a
// body limit, or making the app add a field on load without counting it here fails.

type Sections = Array<Record<string, unknown>>;

const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

// A text block whose value brings the content's measured size to exactly `target`.
function padTo(sections: Sections, target: number, char = "a"): Sections {
  const charBytes = contentSaveBytes([{ value: char }]) - contentSaveBytes([{ value: "" }]);
  const padded = structuredClone(sections);
  const block = { id: "pad", type: "text", value: "" };
  (padded[0].items as Array<Record<string, unknown>>)[0].contents = [
    ...(((padded[0].items as Array<Record<string, unknown>>)[0].contents as unknown[]) ?? []),
    block,
  ];
  const missing = target - contentSaveBytes(padded);
  expect(missing).toBeGreaterThanOrEqual(0);
  block.value = char.repeat(Math.floor(missing / charBytes)) + "a".repeat(missing % charBytes);
  expect(contentSaveBytes(padded)).toBe(target);
  return padded;
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// Stored content the app grows the most when it loads and saves it: every default it fills
// in (titles, descriptions, content lists and ids, completion flags, placeholder tasks) missing.
const growthCases: Array<[string, Sections]> = [
  ["tiny tasks with no title, description, contents or completion", [
    { id: "s", items: range(6000).map((index) => ({ id: `t${index}`, title: "" })) },
  ]],
  ["content blocks with no id or value, and repeated ids", [
    {
      id: "s",
      title: "Blocks",
      items: [{
        id: "t",
        title: "Task",
        contents: [
          ...range(3000).map(() => ({ type: "text" })),
          ...range(3000).map(() => ({ id: "c", type: "image", value: "" })),
          ...range(500).map(() => ({ type: "subItems" })),
        ],
      }],
    },
  ]],
  ["Sub-tasks with no title or completion", [
    {
      id: "s",
      items: [
        { id: "t", title: "Task", contents: [{ id: "c", type: "subItems", subItems: range(6000).map((index) => ({ id: `u${index}` })) }] },
        { id: "t2", title: "Legacy", subItems: range(2000).map((index) => ({ id: `v${index}` })) },
      ],
    },
  ]],
  ["empty sections with no title", [
    { id: "s", items: [{ id: "t", title: "Task" }] },
    ...range(4000).map((index) => ({ id: `s${index}`, items: [] })),
  ]],
  ["multibyte and escaped text, notes and unknown keys", [
    {
      id: "s",
      title: "Émoji 🚀",
      items: range(200).map((index) => ({
        id: `t${index}`,
        title: "Ünïcode ✓",
        notes: "\u0001\u0002 \" \\ 🚀",
        extra: { nested: ["\n\t"] },
        contents: [{ id: `c${index}`, type: "text", value: "  \" \\ \n é 🚀" }],
      })),
    },
  ]],
];

// The largest envelope the editor sends next to the sections: every field at its limit, in
// characters JSON writes as six-byte escapes.
const control = (length: number) => "\u0001".repeat(length);
const maxEnvelope = {
  title: control(TEMPLATE_TITLE_MAX),
  description: control(TEMPLATE_DESCRIPTION_MAX),
  type: "checklist" as const,
  seoTitle: control(TEMPLATE_SEO_TITLE_MAX),
  seoDescription: control(TEMPLATE_SEO_DESCRIPTION_MAX),
  seoUrl: control(TEMPLATE_SLUG_MAX),
  categories: range(TEMPLATE_LIST_MAX_ITEMS).map(() => control(TEMPLATE_LIST_ITEM_MAX)),
  tags: range(TEMPLATE_LIST_MAX_ITEMS).map(() => control(TEMPLATE_LIST_ITEM_MAX)),
  isPublic: false,
  version: Number.MAX_SAFE_INTEGER,
};

function loadTemplate(stored: Sections) {
  return mapApiTemplate({ id: "template-1", title: "Template", items: JSON.stringify(stored), version: 1 });
}

// What the editor sends for a template it loaded and saved without changes.
function editorSaveBody(stored: Sections) {
  const form = buildTemplateEditorFormValues(loadTemplate(stored));
  const { sections } = applyTemplateSaveDefaults("Template", form.sections as unknown as ChecklistSection[]);
  return { sections, body: buildTemplateUpdateRequest({ id: "template-1", ...maxEnvelope, sections }) };
}

// A run started from the template, as POST /api/checklists stores it.
const startRun = (stored: Sections): Sections =>
  resetRunCompletionState(sanitizeStoredSections(normalizeSectionsPayload(stored).sections)) as Sections;

// What the run page sends for a save (a rename, so the title is included too).
function runSaveBody(runSections: Sections) {
  const run = mapChecklistToRun({ id: "run-1", title: control(RUN_TITLE_MAX), items: JSON.stringify(runSections), revision: 1 }, "run-1");
  return { sections: run.sections, body: buildRunUpdatePayload(run, { includeTitle: true }) };
}

function setEveryCompletion(sections: Sections, isCompleted: boolean): Sections {
  const tick = (record: Record<string, unknown>) => ({ ...record, isCompleted });
  return sections.map((section) => ({
    ...section,
    items: (section.items as Array<Record<string, unknown>>).map((item) => ({
      ...tick(item),
      ...(Array.isArray(item.subItems) ? { subItems: item.subItems.map(tick) } : {}),
      ...(Array.isArray(item.contents)
        ? {
            contents: item.contents.map((content: Record<string, unknown>) =>
              Array.isArray(content.subItems) ? { ...content, subItems: content.subItems.map(tick) } : content),
          }
        : {}),
    })),
  }));
}

describe("content size limits", () => {
  const templateBodyLimit = requestBodyLimit("templates/template-1").maxBytes;
  const runBodyLimits = [
    requestBodyLimit("checklists/run-1").maxBytes,
    requestBodyLimit("checklists/shared/share-token").maxBytes,
  ];

  it("leave room under the save routes' body limit", () => {
    expect(TEMPLATE_CONTENT_MAX_BYTES).toBeLessThan(RUN_CONTENT_MAX_BYTES);
    expect(TEMPLATE_CONTENT_MAX_BYTES + utf8Bytes(buildTemplateUpdateRequest({ id: "t", ...maxEnvelope, sections: [] })))
      .toBeLessThan(templateBodyLimit);
    for (const limit of runBodyLimits) expect(RUN_CONTENT_MAX_BYTES).toBeLessThan(limit);
  });

  it.each(growthCases)("bound what the app sends back for %s", (_label, content) => {
    const stored = padTo(content, TEMPLATE_CONTENT_MAX_BYTES);

    // The template loads, and saves again unchanged (Duplicate sends the loaded sections).
    expect(utf8Bytes(loadTemplate(stored).sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    const editor = editorSaveBody(stored);
    expect(utf8Bytes(editor.sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(utf8Bytes(editor.body)).toBeLessThanOrEqual(templateBodyLimit);

    // A run started from it fits the run limit, and its page can save it.
    const run = startRun(stored);
    expect(contentSaveBytes(run)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(utf8Bytes(runSaveBody(run).body)).toBeLessThanOrEqual(Math.min(...runBodyLimits));

    // Notes grow it up to the run limit; every task ticked, it still saves.
    const annotated = padTo(run, RUN_CONTENT_MAX_BYTES);
    const ticked = setEveryCompletion(annotated, true);
    const saved = runSaveBody(ticked);
    expect(utf8Bytes(saved.sections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(utf8Bytes(saved.body)).toBeLessThanOrEqual(Math.min(...runBodyLimits));
  });

  // A save sends the whole run, so a tick must never count against the limit: a run whose
  // notes reached it can still be ticked and unticked.
  it("measure a run the same whichever tasks are ticked", () => {
    const run = startRun(padTo(growthCases[2][1], TEMPLATE_CONTENT_MAX_BYTES));
    expect(contentSaveBytes(setEveryCompletion(run, true))).toBe(contentSaveBytes(run));
    expect(contentSaveBytes(setEveryCompletion(run, false))).toBe(contentSaveBytes(run));
  });

  // D1 refuses rows over 2,000,000 bytes. A template_versions snapshot holds the template row
  // as JSON, so its content is escaped a second time.
  it("keep a Template's version snapshot under D1's row limit", async () => {
    const stored = padTo([{ id: "s", title: "Quotes", items: [{ id: "t", title: "Task" }] }], TEMPLATE_CONTENT_MAX_BYTES, "\"");
    const version = await buildTemplateVersionValues({
      templateId: "template-1",
      version: 1,
      changedByUserId: "user-1",
      subject: { type: "user", id: "user-1" },
      snapshot: { ...maxEnvelope, id: "template-1", items: JSON.stringify(stored) },
      changeSummary: "template.updated",
    });
    const rowBytes = Object.values(version).reduce<number>(
      (total, value) => total + new TextEncoder().encode(String(value)).byteLength,
      0,
    );
    expect(rowBytes).toBeLessThan(2_000_000);
  });
});

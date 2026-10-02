import { describe, expect, it } from "vitest";
import { elementAt, firstOf } from "../../../support/elements";

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
import { buildTemplateVersionValues } from "@functions/api/utils/audit";
import { requestBodyLimit } from "@functions/api/utils/body-limit";
import { normalizeSectionsPayload } from "@functions/api/utils/payloads";
import { resetRunCompletionState } from "@functions/api/utils/template-reconciliation";

type Sections = Array<Record<string, unknown>>;

const D1_MAX_ROW_BYTES = 2_000_000;

const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function withTextBlockPaddingTo(sections: Sections, target: number, char = "a"): Sections {
  const charBytes = contentSaveBytes([{ value: char }]) - contentSaveBytes([{ value: "" }]);
  const padded = structuredClone(sections);
  const block = { id: "pad", type: "text", value: "" };
  firstOf(firstOf(padded).items as Array<Record<string, unknown>>).contents = [
    ...((firstOf(firstOf(padded).items as Array<Record<string, unknown>>).contents as unknown[]) ?? []),
    block,
  ];
  const missing = target - contentSaveBytes(padded);
  expect(missing).toBeGreaterThanOrEqual(0);
  block.value = char.repeat(Math.floor(missing / charBytes)) + "a".repeat(missing % charBytes);
  expect(contentSaveBytes(padded)).toBe(target);
  return padded;
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

const contentMissingEveryDefaultTheAppFillsIn: Array<[string, Sections]> = [
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

const sixByteJsonEscapes = (length: number) => "\u0001".repeat(length);
const largestEditorEnvelope = {
  title: sixByteJsonEscapes(TEMPLATE_TITLE_MAX),
  description: sixByteJsonEscapes(TEMPLATE_DESCRIPTION_MAX),
  type: "checklist" as const,
  seoTitle: sixByteJsonEscapes(TEMPLATE_SEO_TITLE_MAX),
  seoDescription: sixByteJsonEscapes(TEMPLATE_SEO_DESCRIPTION_MAX),
  seoUrl: sixByteJsonEscapes(TEMPLATE_SLUG_MAX),
  categories: range(TEMPLATE_LIST_MAX_ITEMS).map(() => sixByteJsonEscapes(TEMPLATE_LIST_ITEM_MAX)),
  tags: range(TEMPLATE_LIST_MAX_ITEMS).map(() => sixByteJsonEscapes(TEMPLATE_LIST_ITEM_MAX)),
  isPublic: false,
  version: Number.MAX_SAFE_INTEGER,
};

function loadTemplate(stored: Sections) {
  return mapApiTemplate({ id: "template-1", title: "Template", items: JSON.stringify(stored), version: 1 });
}

function editorBodyForAnUnchangedSave(stored: Sections) {
  const form = buildTemplateEditorFormValues(loadTemplate(stored));
  const { sections } = applyTemplateSaveDefaults("Template", form.sections);
  return { sections, body: buildTemplateUpdateRequest({ id: "template-1", ...largestEditorEnvelope, sections }) };
}

const runAsPostChecklistsStoresIt = (stored: Sections): Sections =>
  resetRunCompletionState(sanitizeStoredSections(normalizeSectionsPayload(stored).sections)) as Sections;

function runRenameSaveBody(runSections: Sections) {
  const run = mapChecklistToRun({ id: "run-1", title: sixByteJsonEscapes(RUN_TITLE_MAX), items: JSON.stringify(runSections), revision: 1 }, "run-1");
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

describe("content size limits, so every stored Template and run fits back through its own save route", () => {
  const templateBodyLimit = requestBodyLimit("templates/template-1").maxBytes;
  const runBodyLimits = [
    requestBodyLimit("checklists/run-1").maxBytes,
    requestBodyLimit("checklists/shared/share-token").maxBytes,
  ];
  const smallestRunBodyLimit = Math.min(...runBodyLimits);

  it("leave room under the save routes' body limit", () => {
    expect(TEMPLATE_CONTENT_MAX_BYTES).toBeLessThan(RUN_CONTENT_MAX_BYTES);
    expect(TEMPLATE_CONTENT_MAX_BYTES + utf8Bytes(buildTemplateUpdateRequest({ id: "t", ...largestEditorEnvelope, sections: [] })))
      .toBeLessThan(templateBodyLimit);
    for (const limit of runBodyLimits) expect(RUN_CONTENT_MAX_BYTES).toBeLessThan(limit);
  });

  it.each(contentMissingEveryDefaultTheAppFillsIn)("bound what the app sends back for %s", (_label, content) => {
    const stored = withTextBlockPaddingTo(content, TEMPLATE_CONTENT_MAX_BYTES);

    const sectionsDuplicateSends = loadTemplate(stored).sections;
    expect(utf8Bytes(sectionsDuplicateSends)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    const unchangedEditorSave = editorBodyForAnUnchangedSave(stored);
    expect(utf8Bytes(unchangedEditorSave.sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(utf8Bytes(unchangedEditorSave.body)).toBeLessThanOrEqual(templateBodyLimit);

    const startedRun = runAsPostChecklistsStoresIt(stored);
    expect(contentSaveBytes(startedRun)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(utf8Bytes(runRenameSaveBody(startedRun).body)).toBeLessThanOrEqual(smallestRunBodyLimit);

    const runGrownToTheRunLimit = withTextBlockPaddingTo(startedRun, RUN_CONTENT_MAX_BYTES);
    const everyTaskTickedSave = runRenameSaveBody(setEveryCompletion(runGrownToTheRunLimit, true));
    expect(utf8Bytes(everyTaskTickedSave.sections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(utf8Bytes(everyTaskTickedSave.body)).toBeLessThanOrEqual(smallestRunBodyLimit);
  });

  it("measure a run the same whichever tasks are ticked, so a run at the limit can still be ticked and unticked", () => {
    const [, subTasksWithNoTitleOrCompletion] = elementAt(contentMissingEveryDefaultTheAppFillsIn, 2);
    const run = runAsPostChecklistsStoresIt(withTextBlockPaddingTo(subTasksWithNoTitleOrCompletion, TEMPLATE_CONTENT_MAX_BYTES));
    expect(contentSaveBytes(setEveryCompletion(run, true))).toBe(contentSaveBytes(run));
    expect(contentSaveBytes(setEveryCompletion(run, false))).toBe(contentSaveBytes(run));
  });

  it("keep a Template's version snapshot, which escapes the content a second time, under D1's row limit", async () => {
    const quoteEscapedTwice = "\"";
    const stored = withTextBlockPaddingTo([{ id: "s", title: "Quotes", items: [{ id: "t", title: "Task" }] }], TEMPLATE_CONTENT_MAX_BYTES, quoteEscapedTwice);
    const version = await buildTemplateVersionValues({
      templateId: "template-1",
      version: 1,
      changedByUserId: "user-1",
      subject: { type: "user", id: "user-1" },
      snapshot: { ...largestEditorEnvelope, id: "template-1", items: JSON.stringify(stored) },
      changeSummary: "template.updated",
    });
    const rowBytes = Object.values(version).reduce<number>(
      (total, value) => total + new TextEncoder().encode(String(value)).byteLength,
      0,
    );
    expect(rowBytes).toBeLessThan(D1_MAX_ROW_BYTES);
  });
});

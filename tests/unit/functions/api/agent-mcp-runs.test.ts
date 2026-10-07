import { describe, expect, it } from "vitest";

import { boundedText, toWellFormedText } from "@functions/api/handlers/agentMcpPages";
import { retiredWorkOf } from "@functions/api/handlers/agentMcpRuns";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("boundedText", () => {
  it("never cuts an emoji in half at any cut position", () => {
    for (let offset = 490; offset <= 505; offset += 1) {
      const text = `${"a".repeat(offset)}\u{1F680}${"b".repeat(60)}`;
      const bounded = boundedText(text, 500);

      expect(bounded, `emoji at ${offset}`).not.toMatch(LONE_SURROGATE);
      expect(bounded.length).toBeLessThanOrEqual(500);
      expect(bounded.endsWith("…")).toBe(true);
    }
  });

  it("keeps an emoji that fits before the cut", () => {
    expect(boundedText(`${"a".repeat(497)}\u{1F680}${"b".repeat(60)}`, 500))
      .toBe(`${"a".repeat(497)}\u{1F680}…`);
    expect(boundedText(`${"a".repeat(498)}\u{1F680}${"b".repeat(60)}`, 500))
      .toBe(`${"a".repeat(498)}…`);
  });

  it("returns text within the limit unchanged, even when it ends in an emoji", () => {
    const text = `${"a".repeat(158)}\u{1F680}`;

    expect(boundedText(text)).toBe(text);
    expect(boundedText(undefined)).toBe("Untitled");
  });

  it("replaces lone surrogates already in stored text", () => {
    expect(boundedText("Broken \uD83D title")).toBe("Broken � title");
    expect(boundedText(`${"a".repeat(170)}\uDE80`)).not.toMatch(LONE_SURROGATE);
  });

  it("handles the smallest limits, where an emoji takes two UTF-16 units", () => {
    expect(boundedText("\u{1F680}\u{1F680}", 1)).toBe("…");
    expect(boundedText("\u{1F680}\u{1F680}", 2)).toBe("…");
    expect(boundedText("\u{1F680}\u{1F680}", 3)).toBe("\u{1F680}…");
    expect(boundedText("\u{1F680}", 2)).toBe("\u{1F680}");
  });
});

describe("toWellFormedText", () => {
  it("replaces only unpaired surrogates", () => {
    expect(toWellFormedText("ok \u{1F680} \uD83D \uDE80 end")).toBe("ok \u{1F680} � � end");
  });
});

describe("retiredWorkOf", () => {
  const retiredSection = { kind: "section", section: { id: "old", title: "Old", items: [{ id: "old-1" }, { id: "old-2" }] } };
  const retiredTask = { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "DNS" } };
  const retiredTaskAgain = { kind: "item", sectionId: "old", item: { id: "task-dns", title: "DNS, earlier" } };
  const retiredSubtask = { kind: "subItem", sectionId: "section-1", itemId: "task-1", subItem: { id: "sub-9" } };
  const retiredAnswer = { kind: "formAnswer", sectionId: "section-1", itemId: "task-1", field: { id: "field-1", answer: "Acme" } };
  const malformed = [{ kind: "section" }, { kind: "item", item: "not a record" }, { sectionId: "section-1" }, { kind: "subItem" }];
  const retired = [retiredSection, retiredTask, retiredTaskAgain, retiredSubtask, retiredAnswer, ...malformed];

  it("returns every entry without a scope", () => {
    expect(retiredWorkOf(retired, {})).toEqual(retired);
  });

  it("keeps the retired work of the requested section", () => {
    expect(retiredWorkOf(retired, { sectionId: "section-1" })).toEqual([retiredTask, retiredSubtask, retiredAnswer, { sectionId: "section-1" }]);
    expect(retiredWorkOf(retired, { sectionId: "old" })).toEqual([retiredSection, retiredTaskAgain]);
  });

  it("keeps the retired work of the requested task, including every copy of a repeated id", () => {
    expect(retiredWorkOf(retired, { taskId: "task-1" })).toEqual([retiredSubtask, retiredAnswer]);
    expect(retiredWorkOf(retired, { taskId: "task-dns" })).toEqual([retiredTask, retiredTaskAgain]);
    expect(retiredWorkOf(retired, { sectionId: "old", taskId: "old-2" })).toEqual([
      { kind: "section", section: { id: "old", title: "Old", items: [{ id: "old-2" }] } },
    ]);
  });

  it("finds nothing for ids that no retired work holds", () => {
    expect(retiredWorkOf(retired, { sectionId: "missing" })).toEqual([]);
    expect(retiredWorkOf(retired, { taskId: "missing" })).toEqual([]);
    expect(retiredWorkOf(retired, { sectionId: "old", taskId: "task-1" })).toEqual([]);
  });
});

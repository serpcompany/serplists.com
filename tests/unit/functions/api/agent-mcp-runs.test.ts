import { describe, expect, it } from "vitest";

import {
  boundedText,
  jsonByteLength,
  MAX_RESULT_BYTES,
  outlineRetiredItems,
  selectRunScope,
  toWellFormedText,
} from "@functions/api/handlers/agentMcpRuns";

// A UTF-16 surrogate half without its partner. JSON.stringify writes one as a "\ud83d"
// escape, which strict parsers such as serde_json (Codex) reject.
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

  it("handles the smallest limits", () => {
    // An emoji is two UTF-16 units.
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

describe("selectRunScope", () => {
  const live = [{ id: "section-1", title: "Live", items: [{ id: "task-1", title: "Verify" }, { id: "task-2" }] }];
  const retiredSection = { kind: "section", section: { id: "old", title: "Old", items: [{ id: "old-1" }, { id: "old-2" }] } };
  const retiredTask = { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "DNS" } };
  const retiredTaskAgain = { kind: "item", sectionId: "old", item: { id: "task-dns", title: "DNS, earlier" } };
  const retiredSubtask = { kind: "subItem", sectionId: "section-1", itemId: "task-1", subItem: { id: "sub-9" } };
  const malformed = [{ kind: "section" }, { kind: "item", item: "not a record" }, { sectionId: "section-1" }, { kind: "subItem" }];
  const retired = [retiredSection, retiredTask, retiredTaskAgain, retiredSubtask, ...malformed];

  it("returns everything without a scope", () => {
    expect(selectRunScope(live, retired, {})).toEqual({ sections: live, retiredItems: retired });
  });

  it("keeps the retired work of the requested section", () => {
    expect(selectRunScope(live, retired, { sectionId: "section-1" })).toEqual({
      sections: live,
      retiredItems: [retiredTask, retiredSubtask, { sectionId: "section-1" }],
    });
    expect(selectRunScope(live, retired, { sectionId: "old" })).toEqual({
      sections: [],
      retiredItems: [retiredSection, retiredTaskAgain],
    });
  });

  it("keeps the retired work of the requested task, including every copy of a repeated id", () => {
    expect(selectRunScope(live, retired, { taskId: "task-1" })).toEqual({
      sections: [{ ...live[0], items: [live[0].items[0]] }],
      retiredItems: [retiredSubtask],
    });
    expect(selectRunScope(live, retired, { taskId: "task-dns" })).toEqual({
      sections: [],
      retiredItems: [retiredTask, retiredTaskAgain],
    });
    expect(selectRunScope(live, retired, { sectionId: "old", taskId: "old-2" })).toEqual({
      sections: [],
      retiredItems: [{ kind: "section", section: { id: "old", title: "Old", items: [{ id: "old-2" }] } }],
    });
  });

  it("reports ids that neither live nor retired work holds", () => {
    expect(() => selectRunScope(live, retired, { sectionId: "missing" })).toThrow("Section not found");
    expect(() => selectRunScope(live, retired, { taskId: "missing" })).toThrow("Task not found");
    expect(() => selectRunScope(live, retired, { sectionId: "old", taskId: "task-1" })).toThrow("Task not found");
  });
});

describe("outlineRetiredItems", () => {
  it("names retired work and the ids that read it, never its notes", () => {
    expect(outlineRetiredItems([
      { kind: "section", section: { id: "old", title: "Old", items: [{ id: "old-1", title: "One", notes: "secret" }] } },
      { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "DNS", notes: "secret" } },
      { kind: "subItem", sectionId: "section-1", itemId: "task-1", subItem: { id: "sub-9", title: "Check" } },
      { kind: "item", item: null },
    ])).toEqual([
      { kind: "section", id: "old", title: "Old", tasks: [{ id: "old-1", title: "One" }] },
      { kind: "item", id: "task-dns", title: "DNS", sectionId: "section-1" },
      { kind: "subItem", id: "sub-9", title: "Check", sectionId: "section-1", itemId: "task-1" },
      { kind: "item", id: undefined, title: "Untitled", sectionId: undefined },
    ]);
  });

  it("stays well under the result limit however much retired work a run has", () => {
    const entries = Array.from({ length: 20_000 }, (_, index) => ({
      kind: "section",
      section: {
        id: `section-${index}`,
        title: "文".repeat(400),
        items: Array.from({ length: 20 }, (_, task) => ({ id: `task-${index}-${task}`, title: "Task" })),
      },
    }));

    const outline = outlineRetiredItems(entries);

    expect(outline.length).toBeGreaterThan(0);
    expect(outline[0]).toEqual(expect.objectContaining({ id: "section-0", taskCount: 20 }));
    expect(jsonByteLength(outline)).toBeLessThanOrEqual(MAX_RESULT_BYTES / 4);
  });
});

import { describe, expect, it } from "vitest";

import { boundedText, toWellFormedText } from "@functions/api/handlers/agentMcpRuns";

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

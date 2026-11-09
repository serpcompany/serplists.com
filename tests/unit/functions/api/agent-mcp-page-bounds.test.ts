import { describe, expect, it } from "vitest";
import { bounded, MAX_RESULT_BYTES, pack, START, type Unit } from "@functions/api/handlers/agentMcpPages";
import { toolErrorOf } from "../../../support/agentMcp";

const unit = (json: string): Unit => ({ json, bytes: new TextEncoder().encode(json).byteLength });

const ROOM_FOR_THE_QUOTES_AND_EIGHTEEN_BYTES = 20;

const partEnd = (json: string, offset = 0) =>
  pack([unit(json)], { ...START, offset }, ROOM_FOR_THE_QUOTES_AND_EIGHTEEN_BYTES).part?.to;

describe("bounded, the last check of a read page before it is returned", () => {
  it("returns a page within the bound as it is", () => {
    const page = { templates: [{ id: "template-1", title: "Release SOP" }] };

    expect(bounded(page)).toBe(page);
  });

  it("refuses a page over the bound with result_too_large", () => {
    const error = toolErrorOf(() => bounded({ templates: [{ id: "template-1", title: "x".repeat(MAX_RESULT_BYTES) }] }));

    expect(error.code).toBe("result_too_large");
    expect(error.details).toEqual({ limit: MAX_RESULT_BYTES });
  });
});

describe("a part of an entry too large for one result, measured as JSON text", () => {
  it("counts a control character without a short escape as the six bytes of its \\u escape", () => {
    expect(partEnd("\u0001".repeat(30))).toBe(3);
  });

  it("counts a control character with a short escape, such as a newline, as two bytes", () => {
    expect(partEnd("\n".repeat(30))).toBe(9);
  });

  it("counts the lone half of an emoji a part starts inside as six bytes, and the whole emoji after it as four", () => {
    expect(partEnd("\u{1F680}".repeat(20), 1)).toBe(8);
  });
});

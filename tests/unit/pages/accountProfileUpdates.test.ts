import { describe, expect, it } from "vitest";
import { buildAccountUpdatePayload } from "@/pages/accountProfileUpdates";

describe("buildAccountUpdatePayload", () => {
  it("includes username when it changed", () => {
    const payload = buildAccountUpdatePayload(
      {
        fullName: "Devin",
        username: "devinschumacher",
        avatar_url: "",
      },
      {
        name: "Devin",
        username: "",
        image: "",
      }
    );

    expect(payload).toEqual({ username: "devinschumacher" });
  });

  it("returns empty payload when nothing changed", () => {
    const payload = buildAccountUpdatePayload(
      {
        fullName: "Devin",
        username: "devin",
        avatar_url: "https://example.com/a.png",
      },
      {
        name: "Devin",
        username: "devin",
        image: "https://example.com/a.png",
      }
    );

    expect(payload).toEqual({});
  });
});

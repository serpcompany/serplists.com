import { describe, expect, it, vi } from "vitest";
import {
  buildAccountUpdatePayload,
  planAccountUpdate,
  saveProfileChanges,
} from "@/views/accountProfileUpdates";
import { stringMatching } from "../../support/asymmetricMatchers";

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

describe("buildAccountUpdatePayload never sends a key it would drop", () => {
  it("does not return username: undefined when a saved username is cleared, since the no-changes guard counts keys while the wire body is the JSON", () => {
    const payload = buildAccountUpdatePayload(
      { fullName: "Bob", username: "", avatar_url: "" },
      { name: "Bob", username: "bob", image: "" },
    );

    expect(Object.values(payload)).not.toContain(undefined);
    expect(JSON.parse(JSON.stringify(payload))).toStrictEqual(payload);
  });

  it.each([
    [{ fullName: "Bob", username: "bob", avatar_url: "" }],
    [{ fullName: "Robert", username: "", avatar_url: "" }],
    [{ fullName: "Robert", username: "rob", avatar_url: "https://x/a.png" }],
    [{ fullName: "", username: "", avatar_url: "" }],
  ])("round-trips through JSON unchanged for %j", (profileData) => {
    const payload = buildAccountUpdatePayload(profileData, { name: "Bob", username: "bob", image: "" });

    expect(JSON.parse(JSON.stringify(payload))).toStrictEqual(payload);
  });
});

describe("planAccountUpdate", () => {
  it("refuses to clear a saved username instead of reporting a no-op success", () => {
    const plan = planAccountUpdate(
      { fullName: "Bob", username: "", avatar_url: "" },
      { name: "Bob", username: "bob", image: "" },
    );

    expect(plan).toEqual({ ok: false, error: stringMatching(/username/i) });
  });

  it("does not save a name change alone when the username was also cleared", () => {
    const plan = planAccountUpdate(
      { fullName: "Robert", username: "  ", avatar_url: "" },
      { name: "Bob", username: "bob", image: "" },
    );

    expect(plan.ok).toBe(false);
  });

  it("allows an empty username for an account that never had one", () => {
    expect(
      planAccountUpdate({ fullName: "Bob", username: "", avatar_url: "" }, { name: "Bob", username: "", image: "" }),
    ).toEqual({ ok: true, updates: {} });
  });

  it("validates a new username", () => {
    expect(
      planAccountUpdate({ fullName: "Bob", username: "ab", avatar_url: "" }, { name: "Bob" }),
    ).toEqual({ ok: false, error: "Username must be at least 3 characters long" });
    expect(
      planAccountUpdate({ fullName: "Bob", username: "bob_1", avatar_url: "" }, { name: "Bob" }),
    ).toEqual({ ok: false, error: "Username can only contain letters and numbers" });
  });

  it("returns the changes to save", () => {
    expect(
      planAccountUpdate(
        { fullName: "Robert", username: "robert", avatar_url: "" },
        { name: "Bob", username: "bob", image: "" },
      ),
    ).toEqual({ ok: true, updates: { name: "Robert", username: "robert" } });
  });
});

describe("saveProfileChanges", () => {
  const deps = (result: unknown = { data: {} }) => ({
    updateUser: vi.fn().mockResolvedValue(result),
    onSaved: vi.fn(),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    refreshTemplateOwnerData: vi.fn().mockResolvedValue(undefined),
  });

  it("refreshes cached Template lists after a username change, since they embed the owner's username that Share links use", async () => {
    const save = deps();

    await expect(saveProfileChanges({ username: "alicejones" }, save)).resolves.toEqual({ ok: true });

    expect(save.updateUser).toHaveBeenCalledWith({ username: "alicejones" });
    expect(save.onSaved).toHaveBeenCalledTimes(1);
    expect(save.refreshProfile).toHaveBeenCalledTimes(1);
    expect(save.refreshTemplateOwnerData).toHaveBeenCalledTimes(1);
  });

  it("refreshes them after a name change too, since lists show the owner's name", async () => {
    const save = deps();

    await saveProfileChanges({ name: "Alice Jones" }, save);

    expect(save.refreshTemplateOwnerData).toHaveBeenCalledTimes(1);
  });

  it("leaves them alone when only the avatar changed", async () => {
    const save = deps();

    await saveProfileChanges({ image: "https://example.com/a.png" }, save);

    expect(save.refreshProfile).toHaveBeenCalledTimes(1);
    expect(save.refreshTemplateOwnerData).not.toHaveBeenCalled();
  });

  it("changes nothing when the update fails", async () => {
    const save = deps({ error: { message: "Username is already taken" } });

    await expect(saveProfileChanges({ username: "alicejones" }, save)).resolves.toEqual({
      ok: false,
      error: "Username is already taken",
    });

    expect(save.onSaved).not.toHaveBeenCalled();
    expect(save.refreshProfile).not.toHaveBeenCalled();
    expect(save.refreshTemplateOwnerData).not.toHaveBeenCalled();
  });

  it("still reports the save when refreshing the lists fails", async () => {
    const save = deps();
    save.refreshTemplateOwnerData.mockRejectedValue(new Error("offline"));

    await expect(saveProfileChanges({ username: "alicejones" }, save)).resolves.toEqual({ ok: true });
  });

  it("moves the form's baseline before the session refresh, so the refreshed user brings the server's values", async () => {
    const save = deps();
    const order: string[] = [];
    save.onSaved.mockImplementation(() => order.push("baseline moved"));
    save.refreshProfile.mockImplementation(async () => order.push("session refreshed"));

    await saveProfileChanges({ name: "Alice Jones" }, save);

    expect(order).toEqual(["baseline moved", "session refreshed"]);
  });

  it("still reports the save when the session cannot be re-read afterwards", async () => {
    const save = deps();
    save.refreshProfile.mockResolvedValue(false);

    await expect(saveProfileChanges({ name: "Alice Jones" }, save)).resolves.toEqual({ ok: true });
  });
});

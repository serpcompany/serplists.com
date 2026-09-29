import { describe, expect, it } from "vitest";

import { profileFormFromUser, syncProfileForm } from "@/views/accountProfileUpdates";

// An avatar upload or removal refreshes the session user. That refresh must
// not wipe Full Name or Username edits the user has not saved yet.

const savedUser = {
  email: "john@example.com",
  name: "John",
  username: "john",
  image: "",
};

describe("syncProfileForm", () => {
  it("keeps unsaved name and username edits when an avatar upload refreshes the profile", () => {
    const baseline = profileFormFromUser(savedUser);
    const edited = { ...baseline, fullName: "John Smith", username: "johnsmith" };

    const next = syncProfileForm(
      edited,
      baseline,
      profileFormFromUser({ ...savedUser, image: "https://cdn.example.com/a.png" }),
    );

    expect(next).toEqual({
      email: "john@example.com",
      fullName: "John Smith",
      username: "johnsmith",
      avatar_url: "https://cdn.example.com/a.png",
    });
  });

  it("clears the avatar on removal and still keeps the edits", () => {
    const baseline = profileFormFromUser({ ...savedUser, image: "https://cdn.example.com/a.png" });
    const edited = { ...baseline, fullName: "John Smith" };

    const next = syncProfileForm(edited, baseline, profileFormFromUser(savedUser));

    expect(next.fullName).toBe("John Smith");
    expect(next.avatar_url).toBe("");
  });

  it("takes server values for fields the user did not edit", () => {
    const baseline = profileFormFromUser(savedUser);

    const next = syncProfileForm(baseline, baseline, profileFormFromUser({ ...savedUser, name: "Johnny" }));

    expect(next.fullName).toBe("Johnny");
    expect(next.username).toBe("john");
  });

  it("adopts the server's normalized value after a save moved the baseline", () => {
    // After saving "Bob", Account moves the baseline to the saved values, so
    // the refreshed (lowercased) username replaces what was typed.
    const typed = { ...profileFormFromUser(savedUser), username: "Bob" };
    const savedBaseline = { ...typed };

    const next = syncProfileForm(typed, savedBaseline, profileFormFromUser({ ...savedUser, username: "bob" }));

    expect(next.username).toBe("bob");
  });

  it("fills the form from the first user when there is no baseline yet", () => {
    const empty = profileFormFromUser({});

    expect(syncProfileForm(empty, null, profileFormFromUser(savedUser))).toEqual(profileFormFromUser(savedUser));
  });
});

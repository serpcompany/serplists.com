interface ProfileDataInput {
  fullName: string;
  username: string;
  avatar_url: string;
}

interface CurrentUserInput {
  name?: string;
  username?: string;
  image?: string | null;
}

export interface AccountUpdatePayload {
  name?: string;
  image?: string;
  username?: string;
}

export type AccountUpdatePlan =
  | { ok: true; updates: AccountUpdatePayload }
  | { ok: false; error: string };

// Public profile and Template share URLs hang off the username, so a saved
// username can be changed but not removed.
export const USERNAME_REQUIRED_MESSAGE = "Username can't be removed. Enter a new username instead.";

/**
 * The fields that changed. Every returned key has a value: `authClient.updateUser`
 * sends JSON, which drops undefined keys, so an undefined value would pass the
 * caller's "no changes" check and then save nothing.
 */
export const buildAccountUpdatePayload = (
  profileData: ProfileDataInput,
  user: CurrentUserInput
): AccountUpdatePayload => {
  const updates: AccountUpdatePayload = {};

  if (profileData.fullName !== (user.name || "")) {
    updates.name = profileData.fullName;
  }

  if (profileData.avatar_url !== (user.image || "")) {
    updates.image = profileData.avatar_url;
  }

  const username = profileData.username.trim();
  if (username && username !== (user.username || "")) {
    updates.username = username;
  }

  return updates;
};

/** Validates the profile form and returns the changes to save, or why it cannot be saved. */
export const planAccountUpdate = (
  profileData: ProfileDataInput,
  user: CurrentUserInput
): AccountUpdatePlan => {
  const username = profileData.username.trim();

  if (!username && user.username) {
    return { ok: false, error: USERNAME_REQUIRED_MESSAGE };
  }
  if (username && username.length < 3) {
    return { ok: false, error: "Username must be at least 3 characters long" };
  }
  if (username && !/^[a-zA-Z0-9]+$/.test(username)) {
    return { ok: false, error: "Username can only contain letters and numbers" };
  }

  return { ok: true, updates: buildAccountUpdatePayload(profileData, user) };
};

import { getAuthErrorMessage } from "@/lib/auth/authErrors";

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

type UpdateUserResult = { error?: { message?: string } | null } | null | undefined;

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Saves profile changes. Template lists embed the owner's username and name,
 * so when either changes the cached lists are refreshed; otherwise their
 * public links and Share would keep the old username until they go stale.
 */
export const saveProfileChanges = async (
  updates: AccountUpdatePayload,
  deps: {
    updateUser: (updates: AccountUpdatePayload) => Promise<UpdateUserResult>;
    /** Runs once the server accepted the change, before the session refresh. */
    onSaved: () => void;
    // Resolves false when the session could not be re-read; the save itself succeeded.
    refreshProfile: () => Promise<unknown>;
    refreshTemplateOwnerData: () => Promise<unknown>;
  }
): Promise<SaveProfileResult> => {
  const result = await deps.updateUser(updates);
  if (result?.error) {
    return { ok: false, error: getAuthErrorMessage(result.error, "Failed to update profile") };
  }

  deps.onSaved();
  if ("username" in updates || "name" in updates) {
    // A failed refetch only leaves the lists stale; the profile itself was saved.
    void deps.refreshTemplateOwnerData().catch(() => undefined);
  }
  await deps.refreshProfile();
  return { ok: true };
};

export interface ProfileFormValues {
  email: string;
  fullName: string;
  username: string;
  avatar_url: string;
}

export const profileFormFromUser = (
  user: CurrentUserInput & { email?: string }
): ProfileFormValues => ({
  email: user.email || "",
  fullName: user.name || "",
  username: user.username || "",
  avatar_url: user.image || "",
});

/**
 * Merges a refreshed session user into the profile form. Full Name and
 * Username keep what the user typed if it differs from `baseline` (the server
 * values the form last loaded or saved); every other field follows the server.
 * The avatar saves immediately, so it always comes from the server.
 */
export const syncProfileForm = (
  current: ProfileFormValues,
  baseline: ProfileFormValues | null,
  server: ProfileFormValues
): ProfileFormValues => {
  if (!baseline) {
    return server;
  }

  return {
    ...server,
    fullName: current.fullName !== baseline.fullName ? current.fullName : server.fullName,
    username: current.username !== baseline.username ? current.username : server.username,
  };
};

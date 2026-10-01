import { getAuthErrorMessage } from "@/lib/auth/authErrors";

interface ProfileDataInput {
  fullName: string;
  username: string;
  avatar_url: string;
}

interface CurrentUserInput {
  name?: string | undefined;
  username?: string | undefined;
  image?: string | null | undefined;
}

export interface AccountUpdatePayload {
  name?: string;
  image?: string;
  username?: string;
}

export type AccountUpdatePlan =
  | { ok: true; updates: AccountUpdatePayload }
  | { ok: false; error: string };

export const USERNAME_REQUIRED_MESSAGE = "Username can't be removed. Enter a new username instead.";

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

export const saveProfileChanges = async (
  updates: AccountUpdatePayload,
  deps: {
    updateUser: (updates: AccountUpdatePayload) => Promise<UpdateUserResult>;
    onSaved: () => void;
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
  user: CurrentUserInput & { email?: string | undefined }
): ProfileFormValues => ({
  email: user.email || "",
  fullName: user.name || "",
  username: user.username || "",
  avatar_url: user.image || "",
});

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

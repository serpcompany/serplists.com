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

  if (profileData.username !== (user.username || "")) {
    updates.username = profileData.username || undefined;
  }

  return updates;
};

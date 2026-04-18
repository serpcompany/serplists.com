import { buildPublicProfilePath } from '@/lib/routes';

type DashboardProfileUser =
  | {
      email: string;
      id: string;
      username?: string;
    }
  | null;

export const resolveDashboardProfileRedirectTarget = (
  user: DashboardProfileUser,
): string => {
  if (user?.username) {
    return buildPublicProfilePath(user.username);
  }

  return '/account';
};

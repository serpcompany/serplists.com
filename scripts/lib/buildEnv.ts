import { isLocalDevelopmentUrl } from '../../src/lib/apiBaseUrl';

type BuildEnv = Record<string, string | undefined>;

export const assertProductionApiUrl = (env: BuildEnv): void => {
  const value = env.NEXT_PUBLIC_API_URL?.trim();
  if (!value || env.ALLOW_LOCAL_API_URL === '1') return;

  let valid = true;
  try {
    new URL(value);
  } catch {
    valid = false;
  }

  if (!valid || isLocalDevelopmentUrl(value)) {
    throw new Error(
      `Refusing a production build with NEXT_PUBLIC_API_URL=${value}: deployed pages would send ` +
        'API and sign-in requests there. Unset it (deployed builds use the same-origin /api), ' +
        'or set ALLOW_LOCAL_API_URL=1 for a build you will only serve locally.',
    );
  }
};

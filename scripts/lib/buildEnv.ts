import { isLoopbackUrl } from '../../src/lib/apiBaseUrl';

type BuildEnv = Record<string, string | undefined>;

/**
 * Throws when a production build would bake a local or malformed VITE_API_URL into
 * the bundle. Vite inlines every VITE_* value from the shell and .env files, and a
 * deployed bundle pointing at localhost breaks sign-in and every API call for
 * every visitor. Set ALLOW_LOCAL_API_URL=1 to build one on purpose for local use.
 */
export const assertProductionApiUrl = (env: BuildEnv): void => {
  const value = env.VITE_API_URL?.trim();
  if (!value || env.ALLOW_LOCAL_API_URL === '1') return;

  let valid = true;
  try {
    new URL(value);
  } catch {
    valid = false;
  }

  if (!valid || isLoopbackUrl(value)) {
    throw new Error(
      `Refusing a production build with VITE_API_URL=${value}: deployed pages would send ` +
        'API and sign-in requests there. Unset it (deployed builds use /api), or set ' +
        'ALLOW_LOCAL_API_URL=1 for a bundle you will only serve locally. For a local ' +
        'bundle, prefer `pnpm run build:dev`.',
    );
  }
};

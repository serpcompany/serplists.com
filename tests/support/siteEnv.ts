/**
 * Runs `load` with SITE_ENV set as a build or a Worker would have it (undefined: not set at
 * all), then puts the variable back. Code that reads it when it is used sees that value.
 */
export async function withSiteEnv<T>(siteEnv: string | undefined, load: () => T | Promise<T>): Promise<T> {
  const previous = process.env.SITE_ENV;
  if (siteEnv === undefined) delete process.env.SITE_ENV;
  else process.env.SITE_ENV = siteEnv;
  try {
    return await load();
  } finally {
    if (previous === undefined) delete process.env.SITE_ENV;
    else process.env.SITE_ENV = previous;
  }
}

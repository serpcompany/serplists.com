import type { Env } from '@functions/api/types';

function bindingNotGiven(binding: keyof Env): never {
  throw new Error(`The test gave the API no ${binding}: pass apiEnv({ ${binding}: ... }) the binding the code under test uses.`);
}

export class D1DatabaseThatThrows implements D1Database {
  constructor(private readonly fail: () => never) {}

  prepare(): never {
    return this.fail();
  }

  batch(): never {
    return this.fail();
  }

  exec(): never {
    return this.fail();
  }

  withSession(): never {
    return this.fail();
  }

  dump(): never {
    return this.fail();
  }
}

class R2BucketNotGiven implements R2Bucket {
  head(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  get(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  put(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  createMultipartUpload(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  resumeMultipartUpload(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  delete(): never {
    return bindingNotGiven('R2_UPLOADS');
  }

  list(): never {
    return bindingNotGiven('R2_UPLOADS');
  }
}

export type OptionalEnvVar = { [Name in keyof Env]-?: undefined extends Env[Name] ? Name : never }[keyof Env];

export function withoutVars(env: Env, names: readonly OptionalEnvVar[]): Env {
  const left = { ...env };
  for (const name of names) delete left[name];
  return left;
}

export function apiEnv(vars: Partial<Env> = {}): Env {
  return { DB: new D1DatabaseThatThrows(() => bindingNotGiven('DB')), R2_UPLOADS: new R2BucketNotGiven(), ...vars };
}

export const d1ThatRunsNoQuery = (): D1Database =>
  new D1DatabaseThatThrows(() => {
    throw new Error('This D1 only lets drizzle build SQL: the test runs no query on it.');
  });

export const TEST_AUTH_SECRET = 'test-better-auth-secret-32-chars-minimum!!';

export const apiEnvOn = (database: { binding: D1Database }): Env =>
  apiEnv({ DB: database.binding, BETTER_AUTH_SECRET: TEST_AUTH_SECRET });

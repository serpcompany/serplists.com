import type { Env } from '@functions/api/types';

function bindingNotGiven(binding: keyof Env): never {
  throw new Error(`The test gave the API no ${binding}: pass apiEnv({ ${binding}: ... }) the binding the code under test uses.`);
}

class D1DatabaseNotGiven implements D1Database {
  prepare(): never {
    return bindingNotGiven('DB');
  }

  batch(): never {
    return bindingNotGiven('DB');
  }

  exec(): never {
    return bindingNotGiven('DB');
  }

  withSession(): never {
    return bindingNotGiven('DB');
  }

  dump(): never {
    return bindingNotGiven('DB');
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

export function apiEnv(vars: Partial<Env> = {}): Env {
  return { DB: new D1DatabaseNotGiven(), R2_UPLOADS: new R2BucketNotGiven(), ...vars };
}

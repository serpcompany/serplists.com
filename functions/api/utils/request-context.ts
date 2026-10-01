import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { requestId: string };

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId<Result>(requestId: string, work: () => Result): Result {
  return requestContext.run({ requestId }, work);
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

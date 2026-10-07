declare module 'node:async_hooks' {
  export class AsyncLocalStorage<Store> {
    run<Result>(store: Store, callback: () => Result): Result;
    getStore(): Store | undefined;
  }
}

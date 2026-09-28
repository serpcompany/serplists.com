import { describe, expect, it, vi } from 'vitest';

import { createPendingUploads } from '@/features/template-editor/pendingUploads';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

// Lets the store's settle handlers run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPendingUploads', () => {
  it('counts every upload until it finishes', async () => {
    const uploads = createPendingUploads();
    const first = deferred<unknown>();
    const second = deferred<unknown>();

    uploads.track(first.promise);
    uploads.track(second.promise);
    expect(uploads.count()).toBe(2);

    first.resolve({ success: true });
    await flush();
    expect(uploads.count()).toBe(1);

    second.resolve({ success: false });
    await flush();
    expect(uploads.count()).toBe(0);
  });

  it('stops counting an upload that fails', async () => {
    const uploads = createPendingUploads();
    const upload = deferred<unknown>();

    uploads.track(upload.promise);
    upload.reject(new Error('Network down'));
    await flush();

    expect(uploads.count()).toBe(0);
  });

  it('counts the same upload once, and never below zero', async () => {
    const uploads = createPendingUploads();
    const upload = deferred<unknown>();

    uploads.track(upload.promise);
    uploads.track(upload.promise);
    expect(uploads.count()).toBe(1);

    upload.resolve(undefined);
    await flush();
    await flush();
    expect(uploads.count()).toBe(0);
  });

  it('tells subscribers when an upload starts and finishes', async () => {
    const uploads = createPendingUploads();
    const listener = vi.fn();
    const unsubscribe = uploads.subscribe(listener);
    const upload = deferred<unknown>();

    uploads.track(upload.promise);
    expect(listener).toHaveBeenCalledTimes(1);
    upload.resolve(undefined);
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    uploads.track(Promise.resolve());
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

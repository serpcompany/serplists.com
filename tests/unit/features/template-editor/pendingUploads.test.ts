import { describe, expect, it, vi } from 'vitest';

import { createPendingUploads } from '@/features/template-editor/pendingUploads';

import { deferred } from '../../../support/deferred';

const letTheSettleHandlersRun = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPendingUploads', () => {
  it('counts every upload until it finishes', async () => {
    const uploads = createPendingUploads();
    const first = deferred<unknown>();
    const second = deferred<unknown>();

    uploads.track(first.promise);
    uploads.track(second.promise);
    expect(uploads.count()).toBe(2);

    first.resolve({ success: true });
    await letTheSettleHandlersRun();
    expect(uploads.count()).toBe(1);

    second.resolve({ success: false });
    await letTheSettleHandlersRun();
    expect(uploads.count()).toBe(0);
  });

  it('stops counting an upload that fails', async () => {
    const uploads = createPendingUploads();
    const upload = deferred<unknown>();

    uploads.track(upload.promise);
    upload.reject(new Error('Network down'));
    await letTheSettleHandlersRun();

    expect(uploads.count()).toBe(0);
  });

  it('counts the same upload once, and never below zero', async () => {
    const uploads = createPendingUploads();
    const upload = deferred<unknown>();

    uploads.track(upload.promise);
    uploads.track(upload.promise);
    expect(uploads.count()).toBe(1);

    upload.resolve(undefined);
    await letTheSettleHandlersRun();
    await letTheSettleHandlersRun();
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
    await letTheSettleHandlersRun();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    uploads.track(Promise.resolve());
    await letTheSettleHandlersRun();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

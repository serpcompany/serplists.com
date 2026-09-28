import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/shared/AvatarUpload';
import { AVATAR_MIME_TYPES } from '@/lib/schemas/uploadTypes';

// Unit tests run in node with no DOM, so AvatarUpload is rendered shallowly: React's
// state hooks are stubbed and the returned element tree is searched for handlers.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const stubs = {
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
  };
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
});

vi.mock('@/lib/api', () => ({
  api: {
    deleteFromR2: vi.fn(),
    uploadToR2: vi.fn(),
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    updateUser: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const refreshProfile = vi.fn();
const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: auth.user, refreshProfile }),
}));

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findElement(
  node: React.ReactNode,
  predicate: (element: AnyElement) => boolean,
): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as AnyElement;
  if (predicate(element)) return element;
  return findElement(element.props.children as React.ReactNode, predicate);
}

const CURRENT_URL = '/api/uploads/file?key=avatars%2Fu1%2Fold.png';
const CURRENT_KEY = 'avatars/u1/old.png';
const NEW_URL = '/api/uploads/file?key=avatars%2Fu1%2Fnew.png';
const NEW_KEY = 'avatars/u1/new.png';

function render(onAvatarUpdate = vi.fn()) {
  const tree = AvatarUpload({ currentAvatarUrl: CURRENT_URL, onAvatarUpdate });
  const input = findElement(tree, (element) => element.props.type === 'file');
  const removeButton = findElement(
    tree,
    (element) => element.props['aria-label'] === 'Remove avatar',
  );
  return {
    onAvatarUpdate,
    input: input!,
    selectFile: (file: File) => {
      const target = { files: [file], value: 'C:\\fakepath\\file' };
      return (input!.props.onChange as (event: unknown) => Promise<void>)({ target }).then(
        () => target,
      );
    },
    remove: () => (removeButton!.props.onClick as () => Promise<void>)(),
  };
}

const png = () => new File(['png'], 'new.png', { type: 'image/png' });

describe('AvatarUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'u1' };
    vi.mocked(api.uploadToR2).mockResolvedValue({ url: NEW_URL });
    vi.mocked(api.deleteFromR2).mockResolvedValue({ success: true });
  });

  it('keeps the current avatar when saving the new one on the account fails', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({
      data: null,
      error: { status: 429, statusText: 'Too Many Requests', message: 'Too many requests' },
    } as never);
    const view = render();

    await view.selectFile(png());

    expect(api.deleteFromR2).not.toHaveBeenCalledWith(CURRENT_KEY);
    expect(api.deleteFromR2).toHaveBeenCalledWith(NEW_KEY);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(view.onAvatarUpdate).not.toHaveBeenCalled();
  });

  it('deletes nothing when the account update may or may not have been applied', async () => {
    vi.mocked(authClient.updateUser).mockRejectedValue(new TypeError('Failed to fetch'));
    const view = render();

    await view.selectFile(png());

    expect(api.deleteFromR2).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(view.onAvatarUpdate).not.toHaveBeenCalled();
  });

  it('replaces the old avatar only after the account points at the new one', async () => {
    const order: string[] = [];
    vi.mocked(authClient.updateUser).mockImplementation((async () => {
      order.push('updateUser');
      return { data: { status: true }, error: null };
    }) as never);
    vi.mocked(api.deleteFromR2).mockImplementation(async (key: string) => {
      order.push(`delete:${key}`);
      return { success: true };
    });
    const view = render();

    const target = await view.selectFile(png());

    expect(authClient.updateUser).toHaveBeenCalledWith({ image: NEW_URL });
    expect(order).toEqual(['updateUser', `delete:${CURRENT_KEY}`]);
    expect(toast.success).toHaveBeenCalled();
    expect(view.onAvatarUpdate).toHaveBeenCalledWith(NEW_URL);
    // The same file can be picked again later.
    expect(target.value).toBe('');
  });

  it('keeps the avatar file when removing it from the account fails', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({
      data: null,
      error: { status: 500, statusText: 'Internal Server Error' },
    } as never);
    const view = render();

    await view.remove();

    expect(api.deleteFromR2).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(view.onAvatarUpdate).not.toHaveBeenCalled();
  });

  it('deletes the avatar file after removing it from the account', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never);
    const view = render();

    await view.remove();

    expect(authClient.updateUser).toHaveBeenCalledWith({ image: null });
    expect(api.deleteFromR2).toHaveBeenCalledWith(CURRENT_KEY);
    expect(view.onAvatarUpdate).toHaveBeenCalledWith('');
  });

  it('accepts only the image types the API stores for avatars', async () => {
    const view = render();

    const accept = String(view.input.props.accept).split(',');
    expect(accept.filter((entry) => entry.includes('/'))).toEqual([...AVATAR_MIME_TYPES]);
    expect(accept).toEqual(expect.arrayContaining(['.png', '.jpg', '.webp', '.gif']));
    await view.selectFile(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }));

    expect(api.uploadToR2).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  // A file input fires no change event when the picked file is the one it already
  // holds, so every attempt must leave it empty or the same file cannot be retried.
  describe('clears the file input after every attempt', () => {
    beforeEach(() => {
      vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never);
    });

    it('after the upload fails', async () => {
      vi.mocked(api.uploadToR2).mockRejectedValue(new Error('R2 unavailable'));

      const target = await render().selectFile(png());

      expect(toast.error).toHaveBeenCalled();
      expect(target.value).toBe('');
    });

    it('after the account update is refused', async () => {
      vi.mocked(authClient.updateUser).mockResolvedValue({
        data: null,
        error: { status: 500, statusText: 'Internal Server Error' },
      } as never);

      const target = await render().selectFile(png());

      expect(toast.error).toHaveBeenCalled();
      expect(target.value).toBe('');
    });

    it('after a file of the wrong type is refused', async () => {
      const target = await render().selectFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));

      expect(api.uploadToR2).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
      expect(target.value).toBe('');
    });

    it('after a file over 5MB is refused', async () => {
      const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });

      const target = await render().selectFile(big);

      expect(api.uploadToR2).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
      expect(target.value).toBe('');
    });

    it('when no one is signed in', async () => {
      auth.user = null;

      const target = await render().selectFile(png());

      expect(api.uploadToR2).not.toHaveBeenCalled();
      expect(target.value).toBe('');
    });

    it('uploads the same file again after it was removed', async () => {
      const view = render();
      const file = png();

      const first = await view.selectFile(file);
      await view.remove();
      const again = await view.selectFile(file);

      expect(api.uploadToR2).toHaveBeenCalledTimes(2);
      expect(first.value).toBe('');
      expect(again.value).toBe('');
    });
  });
});

import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { AvatarUpload } from '@/components/shared/AvatarUpload';
import { prepareAvatarImage } from '@/lib/imageOptimization';
import { AVATAR_MIME_TYPES } from '../../../fixtures/avatarTypes';

import { findByAriaLabel, findElement, handlerOf } from '../../../support/elementTree';

vi.mock('react', async (importOriginal) =>
  (await import('../../../support/reactHookStubs')).reactWithHookStubs(importOriginal, {
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [initial, () => undefined],
  }),
);

vi.mock('@/lib/api', async () => (await import('../../../support/uploadMocks')).r2UploadApi());

const preparedAvatar = new File(['webp'], 'avatar.webp', { type: 'image/webp' });
vi.mock('@/lib/imageOptimization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/imageOptimization')>()),
  prepareAvatarImage: vi.fn(),
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

const CURRENT_URL = '/api/uploads/file?key=avatars%2Fu1%2Fold.png';
const CURRENT_KEY = 'avatars/u1/old.png';
const NEW_URL = '/api/uploads/file?key=avatars%2Fu1%2Fnew.png';
const NEW_KEY = 'avatars/u1/new.png';

function render(onAvatarUpdate = vi.fn()) {
  const tree = AvatarUpload({ currentAvatarUrl: CURRENT_URL, onAvatarUpdate });
  const input = findElement(tree, (element) => element.props.type === 'file');
  const removeButton = findByAriaLabel(tree, 'Remove avatar');
  assert.exists(input, 'the file input');
  return {
    onAvatarUpdate,
    input,
    selectFile: (file: File) => {
      const target = { files: [file], value: 'C:\\fakepath\\file' };
      return Promise.resolve(handlerOf(input, 'onChange')({ target })).then(() => target);
    },
    remove: () => {
      assert.exists(removeButton, 'the Remove avatar button');
      return handlerOf(removeButton, 'onClick')();
    },
  };
}

const png = () => new File(['png'], 'new.png', { type: 'image/png' });

describe('AvatarUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'u1' };
    vi.mocked(api.uploadToR2).mockResolvedValue({ url: NEW_URL });
    vi.mocked(prepareAvatarImage).mockResolvedValue(preparedAvatar);
    vi.mocked(api.deleteFromR2).mockResolvedValue({ success: true });
  });

  it('keeps the current avatar when saving the new one on the account fails', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({
      data: null,
      error: { status: 429, statusText: 'Too Many Requests', message: 'Too many requests' },
    });
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

  it('replaces the old avatar only after the account points at the new one, and empties the input for the next pick', async () => {
    const order: string[] = [];
    vi.mocked(authClient.updateUser).mockImplementation((async () => {
      order.push('updateUser');
      return { data: { status: true }, error: null };
    }));
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
    expect(target.value).toBe('');
  });

  it('keeps the avatar file when removing it from the account fails', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({
      data: null,
      error: { status: 500, statusText: 'Internal Server Error' },
    });
    const view = render();

    await view.remove();

    expect(api.deleteFromR2).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(view.onAvatarUpdate).not.toHaveBeenCalled();
  });

  it('deletes the avatar file after removing it from the account', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
    const view = render();

    await view.remove();

    expect(authClient.updateUser).toHaveBeenCalledWith({ image: null });
    expect(api.deleteFromR2).toHaveBeenCalledWith(CURRENT_KEY);
    expect(view.onAvatarUpdate).toHaveBeenCalledWith('');
  });

  it('uploads the small square image the browser prepared, not the original, so a large photo is shrunk instead of refused', async () => {
    vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
    const photo = new File([new Uint8Array(12 * 1024 * 1024)], 'photo.png', { type: 'image/png' });

    await render().selectFile(photo);

    expect(prepareAvatarImage).toHaveBeenCalledWith(photo);
    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'avatars', file: preparedAvatar });
    expect(toast.success).toHaveBeenCalled();
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

  describe('clears the file input after every attempt, since a file input fires no change event for the file it already holds', () => {
    beforeEach(() => {
      vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
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
      });

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

    it('after an image the browser cannot read is refused', async () => {
      vi.mocked(prepareAvatarImage).mockRejectedValue(new Error('Failed to load image'));

      const target = await render().selectFile(png());

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

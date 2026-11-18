import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvatarUpload } from '@/components/shared/AvatarUpload';
import { api } from '@/lib/api';
import { prepareAvatarImage } from '@/lib/imageOptimization';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

vi.mock('@/lib/api', async () => (await import('../../../support/uploadMocks')).r2UploadApi());
vi.mock('@/lib/imageOptimization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/imageOptimization')>()),
  prepareAvatarImage: vi.fn(),
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, refreshProfile: vi.fn() }),
}));

const CURRENT_URL = '/api/uploads/file?key=avatars%2Fu1%2Fold.png';

beforeEach(() => {
  vi.mocked(api.deleteFromR2).mockResolvedValue({ success: true });
  vi.mocked(prepareAvatarImage).mockImplementation(async (file: File) => file);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderTheAvatar = (saveAvatar: (avatarUrl: string | null) => Promise<string | null>) =>
  renderSettled(<AvatarUpload currentAvatarUrl={CURRENT_URL} saveAvatar={saveAvatar} />);

const theFileInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
};

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

describe('changing an avatar', () => {
  it('opens the file picker from Upload avatar', async () => {
    await renderTheAvatar(vi.fn(async () => null));
    const opened = vi.fn();
    theFileInput().addEventListener('click', opened);

    await press('Upload avatar');

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner on Upload avatar and locks both buttons while the image uploads', async () => {
    const upload = deferred<{ url: string }>();
    vi.mocked(api.uploadToR2).mockReturnValue(upload.promise);
    await renderTheAvatar(vi.fn(async () => null));

    await act(async () => {
      fireEvent.change(theFileInput(), { target: { files: [new File(['png'], 'new.png', { type: 'image/png' })] } });
    });

    const uploadButton = screen.getByRole('button', { name: /Upload avatar/ });
    expect(within(uploadButton).getByRole('status')).toBeTruthy();
    expect(uploadButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Remove avatar/ })).toHaveProperty('disabled', true);

    await act(async () => {
      upload.resolve({ url: '/api/uploads/file?key=avatars%2Fu1%2Fnew.png' });
      await upload.promise;
    });

    expect(toast.success).toHaveBeenCalledWith('Avatar updated successfully!');
    expect(within(uploadButton).queryByRole('status')).toBeNull();
  });

  it('shows a spinner on Remove avatar while it removes, then says when removing failed', async () => {
    const saved = deferred<string | null>();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderTheAvatar(() => saved.promise);

    await press('Remove avatar');
    const removeButton = screen.getByRole('button', { name: /Remove avatar/ });
    expect(within(removeButton).getByRole('status')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload avatar/ })).toHaveProperty('disabled', true);

    await act(async () => {
      saved.reject(new Error('offline'));
      await saved.promise.catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith('Failed to remove avatar');
    expect(errorLog).toHaveBeenCalledWith('Error removing avatar:', expect.any(Error));
    expect(api.deleteFromR2).not.toHaveBeenCalled();
    expect(removeButton).toHaveProperty('disabled', false);
  });
});

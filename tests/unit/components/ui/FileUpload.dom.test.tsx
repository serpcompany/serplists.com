import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import '../../../support/mockedFileUploads';
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload, type FileUploadChange } from '@/components/ui/file-upload';
import { uploadFile, type UploadResult } from '@/lib/utils/fileUpload';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

async function renderTheUpload(type: 'image' | 'video' | 'file', value = '') {
  const handlers = {
    onValueChange: vi.fn<(value: string) => void>(),
    onFileChange: vi.fn<(change: FileUploadChange) => void>(),
  };
  await renderSettled(<FileUpload signedIn type={type} value={value} {...handlers} />);
  return handlers;
}

const theFileInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
};

describe('the media field of a Template block', () => {
  it('hands a pasted video address or embed code to the block and previews the video', async () => {
    const handlers = await renderTheUpload('video', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');

    fireEvent.change(screen.getByLabelText('Video URL or embed code'), { target: { value: '<iframe src="x"></iframe>' } });

    expect(handlers.onValueChange).toHaveBeenCalledWith('<iframe src="x"></iframe>');
    expect(document.querySelector('iframe[title="Video preview"]')?.getAttribute('src')).toBe('https://www.youtube.com/embed/aqz-KE-bpKQ');
  });

  it('opens the file picker from Click to upload', async () => {
    await renderTheUpload('file');
    const opened = vi.fn();
    theFileInput().addEventListener('click', opened);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Click to upload file' }));
    });

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('says Uploading... while a file uploads and hands the uploaded file to the block', async () => {
    const upload = deferred<UploadResult>();
    vi.mocked(uploadFile).mockReturnValue(upload.promise);
    const handlers = await renderTheUpload('file');

    await act(async () => {
      fireEvent.change(theFileInput(), { target: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] } });
    });
    expect(screen.getByRole('button', { name: 'Uploading...' })).toHaveProperty('disabled', true);

    await act(async () => {
      upload.resolve({ success: true, url: '/api/uploads/file?key=template-files%2Fnotes.txt', fileName: 'notes.txt', fileSize: 5 });
      await upload.promise;
    });

    expect(handlers.onFileChange).toHaveBeenCalledWith({
      value: '/api/uploads/file?key=template-files%2Fnotes.txt',
      fileName: 'notes.txt',
      fileSize: 5,
    });
    expect(screen.getByRole('button', { name: 'Click to upload file' })).toHaveProperty('disabled', false);
  });
});

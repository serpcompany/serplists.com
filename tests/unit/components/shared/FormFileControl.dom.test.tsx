import '../../../support/mockedToasts';
import '../../../support/cleanupAfterEachTest';
import '../../../support/mockedFileUploads';
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { FormFileControl } from '@/components/shared/FormFileControl';
import { uploadFile, type UploadResult } from '@/lib/utils/fileUpload';
import type { FormAnswer } from '@/types/checklist';

import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

async function renderTheControl(answer?: FormAnswer) {
  const onChange = vi.fn<(answer: FormAnswer | undefined) => void>();
  await renderSettled(
    <>
      <span id="brief-label">Brief</span>
      <FormFileControl
        answer={answer}
        describedBy={undefined}
        id="brief"
        labelledBy="brief-label"
        onChange={onChange}
        problem={false}
      />
    </>,
  );
  return onChange;
}

const theFileInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
};

const brief = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

const choose = (files: File[]) =>
  act(async () => {
    fireEvent.change(theFileInput(), { target: { files } });
  });

describe('a file field on the Run page', () => {
  it('opens the file picker from Upload file', async () => {
    await renderTheControl();
    const opened = vi.fn();
    theFileInput().addEventListener('click', opened);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Brief Upload file' }));
    });

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('says Uploading... while the file uploads, then saves it under the name and size of the chosen file', async () => {
    const upload = deferred<UploadResult>();
    vi.mocked(uploadFile).mockReturnValue(upload.promise);
    const onChange = await renderTheControl();

    await choose([brief]);
    expect(screen.getByRole('button', { name: 'Brief Uploading...' })).toHaveProperty('disabled', true);

    await act(async () => {
      upload.resolve({ success: true, url: '/api/uploads/file?key=template-files/brief.pdf' });
      await upload.promise;
    });

    expect(onChange).toHaveBeenCalledWith({
      url: '/api/uploads/file?key=template-files/brief.pdf',
      fileName: 'brief.pdf',
      fileSize: brief.size,
    });
    expect(screen.getByRole('button', { name: 'Brief Upload file' })).toHaveProperty('disabled', false);
  });

  it('saves nothing and says the upload failed when the upload gives no reason', async () => {
    vi.mocked(uploadFile).mockResolvedValue({ success: false });
    const onChange = await renderTheControl();

    await choose([brief]);

    expect(toast.error).toHaveBeenCalledWith('Upload failed', { description: 'Unknown error occurred' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when the picker closes with no file', async () => {
    const onChange = await renderTheControl();

    await choose([]);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names a saved file by its address when it has no name, with no link to an unsafe address', async () => {
    await renderTheControl({ url: 'javascript:alert(1)', fileName: '', fileSize: 0 });

    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove javascript:alert(1)' })).toBeTruthy();
  });
});

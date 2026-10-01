import '../../../support/mockedR2Uploads';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { FileUpload, ImagePreview } from '@/components/ui/file-upload';
import { uploadAcceptAttribute } from '@/lib/schemas/uploadTypes';

import { findByAriaLabel, findElement, findFileInput, type AnyElement } from '../../../support/elementTree';

const useStateStub = vi.hoisted(() => ({ valueForEveryState: undefined as unknown, setterCalls: [] as unknown[] }));
vi.mock('react', async (importOriginal) =>
  (await import('../../../support/reactHookStubs')).reactWithHookStubs(importOriginal, {
    useId: () => 'file-upload-test',
    useRef: () => ({ current: null }),
    useState: <T,>(initial: T) => [
      useStateStub.valueForEveryState === undefined ? initial : useStateStub.valueForEveryState,
      (next: unknown) => {
        useStateStub.setterCalls.push(next);
      },
    ],
  }),
);


const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const EXISTING_URL = '/api/uploads/file?key=template-images%2Fu1%2Fa.png';

async function chooseFiles(tree: unknown, files: File[]) {
  const fileInput = findFileInput(tree);
  assert.exists(fileInput, 'the file input');
  await (fileInput.props.onChange as (event: unknown) => Promise<void>)({ target: { files } });
}

describe('FileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStateStub.valueForEveryState = undefined;
    useStateStub.setterCalls.length = 0;
  });

  it('uploads nothing when the page passes no signed-in user, since the presentational field cannot read the session', async () => {
    const tree = FileUpload({ type: 'file', value: '', onValueChange: vi.fn(), onFileChange: vi.fn() });

    await chooseFiles(tree, [new File(['PK'], 'report.zip', { type: 'application/zip' })]);

    expect(api.uploadToR2).not.toHaveBeenCalled();
  });

  it('clears an uploaded file without deleting the stored object', async () => {
    const onFileChange = vi.fn();
    const tree = FileUpload({
      type: 'image',
      value: EXISTING_URL,
      fileName: 'a.png',
      onValueChange: vi.fn(),
      onFileChange,
    });

    const removeButton = findByAriaLabel(tree, 'Remove uploaded image');
    assert.exists(removeButton, 'the Remove uploaded image button');

    await (removeButton.props.onClick as () => unknown)();

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenCalledWith({
      value: '',
      fileName: undefined,
      fileSize: undefined,
    });
    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });

  it('replaces an uploaded URL without deleting the previous object', async () => {
    vi.mocked(api.uploadToR2).mockResolvedValue({
      url: '/api/uploads/file?key=template-images%2Fu1%2Fb.png',
      fileName: 'b.png',
      fileSize: 10,
    });
    const onFileChange = vi.fn();
    const tree = FileUpload({
      type: 'image',
      value: EXISTING_URL,
      signedIn: true,
      onValueChange: vi.fn(),
      onFileChange,
    });

    await chooseFiles(tree, [new File(['png'], 'b.png', { type: 'image/png' })]);

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenCalledWith({
      value: '/api/uploads/file?key=template-images%2Fu1%2Fb.png',
      fileName: 'b.png',
      fileSize: 10,
    });
    expect(api.deleteFromR2).not.toHaveBeenCalled();
  });

  it.each([
    ['file', 'template-files'],
    ['video', 'template-videos'],
  ] as const)('offers the %s picker only the types the API stores', (type, bucket) => {
    const tree = FileUpload({ type, value: '', onValueChange: vi.fn(), onFileChange: vi.fn() });

    const fileInput = findElement(tree, (element) => element.props.type === 'file');
    expect(fileInput?.props.accept).toBe(uploadAcceptAttribute(bucket));
  });

  it('names the supported types instead of uploading a file the API would refuse', async () => {
    const tree = FileUpload({ type: 'file', value: '', signedIn: true, onValueChange: vi.fn(), onFileChange: vi.fn() });

    await chooseFiles(tree, [new File(['<p>'], 'page.html', { type: 'text/html' })]);

    expect(api.uploadToR2).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Invalid file',
      expect.objectContaining({ description: expect.stringContaining('PDF, ZIP, CSV') }),
    );
  });

  it('uploads a Windows ZIP to a File block', async () => {
    vi.mocked(api.uploadToR2).mockResolvedValue({ url: '/api/uploads/file?key=k', fileName: 'r.zip' });
    const tree = FileUpload({ type: 'file', value: '', signedIn: true, onValueChange: vi.fn(), onFileChange: vi.fn() });
    const zip = new File(['PK'], 'report.zip', { type: 'application/x-zip-compressed' });

    await chooseFiles(tree, [zip]);

    expect(api.uploadToR2).toHaveBeenCalledWith({ bucket: 'template-files', file: zip });
  });

  it('shows the uploaded-file row only while the value is an uploaded file, so its Remove never clears a URL the author typed', () => {
    const tree = FileUpload({
      type: 'file',
      value: 'https://example.com/pricing.pdf',
      fileName: 'report.pdf',
      onValueChange: vi.fn(),
      onFileChange: vi.fn(),
    });

    expect(findByAriaLabel(tree, 'Remove uploaded file')).toBeNull();
    expect(findFileInput(tree)).not.toBeNull();
  });

  describe('image preview of a URL being typed, which fails to load on its first characters', () => {
    const previewFor = (value: string) =>
      findElement(
        FileUpload({ type: 'image', value, onValueChange: vi.fn(), onFileChange: vi.fn() }),
        (element) => element.type === ImagePreview,
      );

    it('gives each URL its own preview, so a failed URL cannot hide the next one', () => {
      const bad = previewFor('https://example.com/phot');
      const good = previewFor('https://example.com/photo.png');

      expect(bad?.key).toBe('https://example.com/phot');
      expect(good?.key).toBe('https://example.com/photo.png');
      expect(good?.props.src).toBe('https://example.com/photo.png');
    });

    it('previews an uploaded image', () => {
      expect(previewFor(EXISTING_URL)?.props.src).toBe(EXISTING_URL);
    });

    it('loads nothing while the URL is only partly typed', () => {
      expect(previewFor('h')?.props.src).toBeNull();
      expect(previewFor('https:')?.props.src).toBeNull();
    });

    it('shows no preview for an empty value', () => {
      expect(previewFor('')).toBeNull();
      expect(previewFor('   ')).toBeNull();
    });

    it('marks a failed load in state instead of hiding the element', () => {
      const img = ImagePreview({ src: 'https://example.com/photo.png' }) as AnyElement;
      expect(img.type).toBe('img');
      expect(img.props.style).toBeUndefined();

      const target = { style: {} as Record<string, string> };
      (img.props.onError as (event: unknown) => void)({ currentTarget: target, target });

      expect(target.style.display).toBeUndefined();
      expect(useStateStub.setterCalls).toEqual([true]);
    });

    it('says the preview is unavailable instead of showing an empty box', () => {
      useStateStub.valueForEveryState = true;
      const failed = ImagePreview({ src: 'https://example.com/photo.png' }) as AnyElement;
      useStateStub.valueForEveryState = undefined;
      const partial = ImagePreview({ src: null }) as AnyElement;

      for (const element of [failed, partial]) {
        expect(element.type).not.toBe('img');
        expect(element.props.children).toBe('Preview unavailable');
      }
    });
  });
});
